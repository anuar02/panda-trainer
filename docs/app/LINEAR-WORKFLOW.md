# trainerApp: Linear rules for agents

Established 2026-09-30 at the owner's request. Follow the repository instructions
and [baseline guide](../../LINEAR-AGENT-GUIDE.md). Decision: [ADR 0020](decisions/0020-linear-coordination.md).

Owner override, 2026-10-01: routine per-task Linear updates are no longer required.
Continue reading scope and dependencies, but keep progress, decisions and checks
in the repository and commit each verified package. Do not automatically write
issue checkpoints after each task. [ADR 0036](decisions/0036-reduced-linear-updates.md).

## Project identity

- Project: [trainerApp](https://linear.app/something-great/project/trainerapp-827feca01ff7).
- Project UUID: `776db647-e846-4a27-99cb-2ade5be400bf`; identifier: `P-SOM-2`.
- Team: Something Great, key `SOM`, UUID `7257df86-9267-445f-a220-d1bbbe49f550`.
- Repository: https://github.com/anuar02/panda-trainer.
- Linear companion: [Agent rules](https://linear.app/something-great/document/trainerapp-agent-rules-35559e89609f).

These identifiers are discovery anchors. Refresh the live records each session;
names, membership and workflow states may change. Do not create another project
because the checkout directory and GitHub repository have different names.

## Start each task

Project scope and current limits: [PROJECT-BRIEF](PROJECT-BRIEF.md).
Roadmap-to-issue mapping and dependency gates: [DELIVERY-PLAN](DELIVERY-PLAN.md).
On 2026-09-30 the owner explicitly requested the full backlog import: 48 issues
across 13 milestones. Reuse those records; the baseline rule against unsolicited
mass imports still applies to future scope. Import decisions: ADR 0021.

1. Read root and applicable directory `AGENTS.md` / `CLAUDE.md`, the baseline guide,
   [README](README.md), [PROJECT-MEMORY](PROJECT-MEMORY.md), the current checkpoint
   in [ROADMAP](ROADMAP.md), [CONVENTIONS](CONVENTIONS.md), [UI-PARITY](UI-PARITY.md)
   and [ADR 0007](decisions/0007-ui-reference.md).
2. Use `graft map` for initial orientation and `graft ask "<task>" --source` before
   searching or opening source. Use `graft grep` for exhaustive indexed searches.
3. Read the live Linear project, its documents, and the relevant issue, including
   acceptance criteria, relations, milestone and discussion. Check the current
   code and evidence; dated notes and old test counts are historical claims.
4. Search for existing issues before creating work. Reuse the matching issue;
   create a distinct issue only within the user's authorized task scope. Do not
   import the entire roadmap automatically or mark historical work complete.
5. Refresh actual team states and labels. Check ownership and dependent work,
   including [TEAM-HANDOFF](TEAM-HANDOFF.md), before editing shared files.

## Issue scope and workflow

Each issue should state the problem, expected behavior, acceptance criteria,
repository paths, boundaries, dependencies and required checks. Separate demo
implementation, production integration and owner acceptance when independently
deliverable. Record blockers using Linear relations as well as concise context.

Observed team states on 2026-09-30 (issue states, not project states):

| State | Use |
| --- | --- |
| Backlog | Captured work awaiting selection |
| Todo | Scoped work ready to start |
| In Progress | Implementation has started |
| In Review | Deliverable and evidence ready for review; required approval pending |
| Done | All issue criteria, required checks and applicable owner acceptance satisfied |
| Canceled / Duplicate | Only with a confirmed reason; link the surviving issue for duplicates |

When the owner requests synchronization, update the matching issue's fields and
status to reflect actual progress. Preserve its hierarchy and existing ownership.
Do not invent assignees, deadlines, estimates, labels, priorities or commitments.
Do not close a parent because one child is complete. If blocked, record the
dependency and missing decision; use a blocked state only if the team has one.

## Sources of truth and acceptance

- Linear holds actionable scope, status, ownership and dependency relations.
- The repository holds code, contracts, ADRs, reproducible checks and evidence.
  ROADMAP keeps stages, current checkpoint and their acceptance criteria.
  Investigate contradictions; under the 2026-10-01 preference, repository progress
  may be newer than Linear until synchronization is requested.
- Preserve `prototype-fresh/index.html` as the default UI and behavior reference.
  Use `prototype-fresh/review/parity/spec-*.json` for numbers. Follow UI-PARITY
  for themes, states, native checks, accessibility, comparisons and exceptions.
- A screen is accepted only after owner approval of the comparisons. Passing
  tests, a demo flow or a screenshot alone does not establish full acceptance.
- Follow CONVENTIONS: TypeScript strict, no `any` or comments in application code,
  i18n strings, domain boundaries, RLS and relevant tests. Product decisions go
  to OPEN-QUESTIONS; architectural or workflow decisions get an ADR.
- Update CHANGELOG and the relevant ROADMAP checkpoint with the work. Preserve
  dated history. Link evidence by repository path or an actual commit/PR URL;
  explicitly identify local, uncommitted or unpublished files.
- Real client data, paid services and store publication require owner consent.

## Communication and completion

Issue comments, project status updates and messages to people require explicit
authorization from the user or applicable instructions. This workflow does not
grant blanket permission to post them. Routine issue field/status maintenance
within an authorized task does not authorize outreach or mass backlog changes.

Before handoff, compare the delivered behavior with acceptance criteria, run the
checks required for that change, and record commands, results and material gaps
in the repository and authorized issue fields. Never reuse historical test counts
as fresh validation. Leave approval-dependent work in review. Report local and
uncommitted work honestly; never imply a push, merge or release occurred.

Verify remote writes from the returned record or a read-back. If the outcome is
uncertain, read before retrying to avoid duplicates. If Linear is unavailable,
continue authorized local work, record the pending synchronization locally and
report exactly which updates remain unsynchronized. Never store credentials,
tokens, real customer messages or sensitive logs in Linear.

The version-controlled document is the maintained rules source; the Linear
project document is its discoverable companion. The 2026-10-01 preference is
recorded locally; the remote companion has not been rewritten for this change.
