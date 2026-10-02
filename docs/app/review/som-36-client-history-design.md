# SOM-36: client history read contract

02 October 2026. Initial read-only audit, followed by safe reader/hook and controlled
history integration. No new schema was needed. Implementation and checks:
[ADR 0047](../decisions/0047-client-finished-history-and-unbounded-dates.md).
Live SOM-36 is Backlog and depends on SOM-32 journal completion, SOM-34 billing,
SOM-35 invitation history, SOM-27 scheduling, and owner decisions SOM-56/SOM-58.
Docker is paused; no database checks were run for this audit.

Sources: `supabase/migrations/20261001140000_workout_journal.sql:11–35,38–113,130–174,214–266`,
`supabase/tests/database/workout_journal.test.sql:124–145`,
`app/src/domain/workout/selectors.ts:10–55`. The existing pgTAP source covers finished/draft
isolation, group peers, shared notes and private-note exclusion; these are existing assertions,
not a fresh validation claim.

## Available reads

Validate the selected active client connection with `get_my_client_schedule_context` and
verify the expected authenticated account before reads. Scope every parent query by both
workspace ID and client record ID, even though RLS also checks linked identity. Never use a
trainer owner session as an implicit client session.

| Table | Safe transport projection | Required filter/order |
| --- | --- | --- |
| `workout_instances` | id,workspace_id,booking_id,client_record_id,source_program_id,source_program_revision,started_at,finished_at,revision | workspace/client card, finished_at not null; finished_at descending then id |
| `workout_exercises` | id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,replaced_from_id,skipped,revision | workspace and already loaded finished instance IDs; position then id |
| `set_results` | id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,seconds,weight_g,revision | workspace and loaded finished instance IDs, deleted_at null; exercise ID then position/id |
| `session_notes` | id,workspace_id,workout_instance_id,text,revision,created_at,updated_at | workspace and loaded finished instance IDs; created_at then id |
| `bookings` | id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status,revision | workspace/card and parent booking IDs, safe existing booking projection |
| `booking_programs` | id,workspace_id,booking_id,name,description,base_template_id,base_template_revision | workspace and own parent booking IDs if program display name needed |

Use bounded pages (500 rows) with stable ordering and supplemental ID batches (200), consistent
with scheduling transport. Reject cross-scope rows, unknown parent IDs, duplicate IDs and
inconsistent foreign keys; do not silently combine client cards. Account/scope changes must
hide old data and reject late responses. A cached finished read may become stale if future
correction commands reopen a journal; refresh behavior belongs to SOM-32 integration.

`private_notes` and `sync_operations` must never be requested by the client-history transport.
There is no shared flag on session_notes: all rows in that table are shared notes, visible to
a client only through their own finished instance. Private notes live in a separate owner-only
table and never need client-side filtering.

## Guards and remaining privacy boundary

RLS permits an owner to read drafts; a linked client can read only finished instances and their
children. Group participants have separate instances, so a peer's sets/notes are hidden.
All direct writes are revoked. Composite foreign keys bind workspace, booking and client card.
The existing `my_client_record_ids()` includes archived cards; direct finished-history RLS still
permits those linked cards. Active connection RPC gating limits the new transport, but does not
change that global RLS behavior or establish a new archive product rule.

The schema currently grants table-level SELECT on journal tables. Therefore a direct client
request can obtain created_by UUIDs and author_user_id/device_id from otherwise visible finished
results/notes. Safe transport projections avoid sending these fields in this application, but
do not globally revoke their API access. A future least-privilege migration can replace grants
with explicit safe columns or redacted read RPCs coordinated with trainer synchronization.
Private-note text is already protected by owner-only RLS; there is no demonstrated private-note
text leak requiring a schema change for this read package.

## Data semantics and gaps

Use exercise snapshots, not current exercise library rows, for historical names/units/metadata.
The client's library rows may be hidden and source exercises may be renamed or archived.
Convert weight_g to kilograms only at display boundaries. Preserve null values and zero values;
constraints allow incomplete set values, even in a partially completed finished journal.
Exclude soft-deleted result rows. Do not fabricate reps, seconds or weights from plan values.

The current schema has replaced_from_id and skipped, but no explicit origin field identifying
added versus original exercises. Display trustworthy replacement/skipping facts; do not invent
prototype 'added' counts without a proved source-plan mapping. Retain historical facts rather
than collapsing replacement rows merely by exercise_id.

A finished journal does not prove attendance, debit, payment or package balance. No attendance/
credit/billing migrations were found in the current schema. History can show actual finished
results and shared notes; billing/attendance summaries stay outside this package. Bookings and
cancellations can form a separate past-schedule list, but should not be relabeled completed
workouts. Workout source_program_id references client_programs; immutable booking_programs are
a distinct snapshot source. Do not substitute one for the other silently.

Required new transport tests: drafts absent from parent request, deleted result filtering,
private table never queried, explicit safe projections exclude auth/device fields, source
snapshot survives library change, own finished history predating identity linkage appears after
invitation, peer/cross-workspace responses rejected, stable paging and batch boundaries,
nullable/zero values preserved, stale account/scope responses ignored. Existing RLS tests still
need rerunning with the complete package once the isolated database is available.
