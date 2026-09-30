# Linear guide for coding agents

Use Linear as the live coordination record for actionable work. Keep implementation detail in the repository's code, contracts, and technical documents, and link to those sources from Linear. Follow any project-specific `AGENTS.md`, `CLAUDE.md`, or equivalent instructions first; this guide is a reusable baseline, not a replacement for them.

## Before starting work

1. Read the repository's startup instructions and the relevant source-of-truth documents. Identify which files and systems belong to your role, what verification is required, and whether another agent owns dependent work.
2. Refresh Linear records at the start of the session. Find the active workspace, team, project, current project documents, and the relevant issue. Treat IDs, names, statuses, assignees, milestones, dependencies, and dated summaries in old notes as leads to verify, not as live facts.
3. Read the issue description, acceptance criteria, milestone, relations, and relevant discussion or project documents. Check the implementation and recent validation evidence yourself; an old issue or audit may no longer describe the current code.
4. Search Linear for existing work before proposing a new issue. Reuse or update the appropriate issue when it already covers the task. Create another issue only when it captures distinct work that needs its own scope or tracking.
5. Identify the team's actual workflow states, labels, and project conventions. Do not assume another team's state names, priority scale, labels, or hierarchy match a previous project.

## Keep the work trackable

- Move an issue into the team's active state when implementation starts, if project instructions call for it. Use review or completion states only when their criteria are met. Do not mark an issue complete just because coding stopped; satisfy its acceptance criteria and required verification first.
- Keep the issue scope concrete: describe the user or system problem, expected behavior, acceptance criteria, ownership boundaries, and relevant repository paths or documents. Record dependencies with Linear relations, not only in prose.
- Preserve existing project hierarchy and ownership. Split a large issue into linked sub-issues when separate pieces can be delivered or accepted independently; retain the parent goal and criteria. Completing one sub-issue does not complete the parent.
- Reuse the team's labels and conventions. Do not invent assignees, dates, estimates, priorities, or commitments. Leave unknown values unset and state the uncertainty when it affects planning.
- Before implementing a cross-team or contract change, establish the dependency and agree how the receiving team will consume it. Keep repository contract requests, API specs, and other local coordination records synchronized when project instructions require it.
- Keep Linear concise and useful for coordination. Put detailed technical design, schemas, API semantics, and reproducible procedures in version-controlled repository documents, then link to them.

## Communicate and update records carefully

- Treat issue comments, project updates, and messages as communication to other people. Post them only when the user or applicable project instructions explicitly authorize that communication.
- When an authorized record update is needed, include factual progress, blockers and next actions, changed behavior, links or paths to the work, and exact verification results. Distinguish implemented behavior from proposals, assumptions, historical observations, and runtime checks.
- Preserve dated project-log history. Add a dated entry instead of replacing prior decisions or summaries unless the document explicitly calls for a current-state rewrite.
- Never put credentials, session tokens, private customer messages, or unredacted sensitive logs in Linear. Link to safe, access-controlled evidence where appropriate.
- Verify every remote change by reading the returned result or fetching the updated record. Do not report a status, comment, relation, or document update as successful without confirmation.

## Finish and report

Before closing or handing off work:

1. Compare the delivered behavior against the issue's acceptance criteria.
2. Run the required checks from repository and project instructions, and record the commands and outcomes accurately. Do not claim tests or runtime checks that were not run.
3. Update the issue's status and completion evidence according to the team's workflow. Include relevant commit, pull request, or local file references; say when work remains local and uncommitted.
4. Record remaining limitations, rollout steps, historical data repair, or follow-up work when they are material. Keep parent issues open until their full scope is accepted.
5. If Linear is unavailable, continue authorized repository work, keep local records current, and report which remote reads or updates could not be synchronized. Never imply that Linear was updated when it was not.

## Session checklist

```text
[ ] Read repository and project-specific agent instructions
[ ] Refreshed the live project and relevant issue records
[ ] Read acceptance criteria, relations, milestone, and relevant discussion
[ ] Checked for duplicate or already-completed work and inspected current code
[ ] Confirmed ownership, workflow states, and dependencies
[ ] Updated only authorized Linear records and verified any remote changes
[ ] Recorded exact implementation and validation evidence
[ ] Left unresolved scope, blockers, and unsynchronized records explicit
```
