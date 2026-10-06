begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(40);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('56000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'journal-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('56000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'journal-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('56000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'journal-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('56000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'journal-client-peer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('56000000-0000-4000-8000-000000000001', 'Journal owner A'),
  ('56000000-0000-4000-8000-000000000002', 'Journal owner B'),
  ('56000000-0000-4000-8000-000000000003', 'Journal client A'),
  ('56000000-0000-4000-8000-000000000004', 'Journal peer');

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Journal workspace A'),
  ('66000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000002', 'Journal workspace B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('76000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000003', 'Journal client A'),
  ('76000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000004', 'Journal peer'),
  ('76000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000002', null, 'Foreign client');

insert into public.group_sessions (id, workspace_id, starts_at, ends_at)
values ('86000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour');

insert into public.bookings (id, workspace_id, client_record_id, group_session_id, starts_at, ends_at, status)
values
  ('96000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed'),
  ('96000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002', '86000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed'),
  ('96000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', null, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed'),
  ('96000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000003', null, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed');

insert into public.workout_templates (id, workspace_id, name)
values ('a6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'Journal source'),
       ('a6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000002', 'Foreign source');
insert into public.client_programs (id, workspace_id, client_record_id, base_template_id, base_template_revision, name)
values
  ('a7000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 1, 'Client A program'),
  ('a7000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 1, 'Peer program'),
  ('a7000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000002', 1, 'Foreign program');

insert into public.workout_instances (id, workspace_id, booking_id, client_record_id, source_program_id, source_program_revision, finished_at)
values
  ('b6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 1, now()),
  ('b6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002', 1, now()),
  ('b6000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000001', null, null, null),
  ('b6000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000004', '76000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000003', 1, now());

select set_config('test.reps_exercise', (select id::text from public.exercises where workspace_id = '66000000-0000-4000-8000-000000000001' and source_key = 'e0'), true);
select set_config('test.seconds_exercise', (select id::text from public.exercises where workspace_id = '66000000-0000-4000-8000-000000000001' and source_key = 'e69'), true);
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_reps)
values ('c6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.reps_exercise')::uuid, 'Squat snapshot', 'reps', false, 'Legs', 'barbell', '{}', 0, 3, '8–12');
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_seconds)
values ('c6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.seconds_exercise')::uuid, 'Plank snapshot', 'seconds', true, 'Core', 'bodyweight', '{}', 1, 2, '30');
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_reps)
values ('c6000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002', current_setting('test.reps_exercise')::uuid, 'Peer squat', 'reps', false, 'Legs', 'barbell', '{}', 0, 3, '8');
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets)
values ('c6000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.reps_exercise')::uuid, 'Unplanned added exercise', 'reps', false, 'Legs', 'barbell', '{}', 50, 0);

insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, reps, weight_g, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 0, 0, 0, '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, seconds, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 0, 0, '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 1, '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.session_notes (id, workspace_id, workout_instance_id, text, author_user_id, device_id)
values ('f6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Shared session note', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.private_notes (id, workspace_id, workout_instance_id, text, author_user_id, device_id)
values ('f7000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Trainer private note', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.private_notes (id, workspace_id, client_record_id, text, author_user_id, device_id)
values ('f7000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'Client private note', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.sync_operations (operation_id, workspace_id, user_id, device_id, kind, entity_id, base_revision, result)
values ('f8000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'set_result.create', 'd6000000-0000-4000-8000-000000000001', 0, '{"private":"possible receipt payload"}');

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.workout_instances'::regclass, 'public.workout_exercises'::regclass, 'public.set_results'::regclass, 'public.session_notes'::regclass, 'public.private_notes'::regclass, 'public.sync_operations'::regclass)), 'all journal tables enable RLS');
select ok(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name in ('workout_instances', 'workout_exercises', 'set_results', 'session_notes', 'private_notes', 'sync_operations') and column_name = 'id' and column_default is not null), 'all journal entity IDs are supplied by the device');
select ok(not has_table_privilege('authenticated', 'public.workout_instances', 'INSERT'), 'authenticated cannot directly insert instances');
select ok(not has_table_privilege('authenticated', 'public.workout_exercises', 'UPDATE'), 'authenticated cannot directly update exercises');
select ok(not has_table_privilege('authenticated', 'public.set_results', 'DELETE'), 'authenticated cannot directly delete results');
select ok(not has_table_privilege('authenticated', 'public.session_notes', 'INSERT'), 'authenticated cannot directly insert shared notes');
select ok(not has_table_privilege('authenticated', 'public.private_notes', 'UPDATE'), 'authenticated cannot directly update private notes');
select ok(not has_table_privilege('authenticated', 'public.sync_operations', 'INSERT'), 'authenticated cannot directly insert sync receipts');
select is((select reps::text || '|' || weight_g::text from public.set_results where id = 'd6000000-0000-4000-8000-000000000001'), '0|0', 'zero remains a measured value');
select is((select count(*)::integer from public.set_results where reps is null and seconds is null), 1, 'an incomplete draft can keep both actual measures null');
select is((select source_program_revision from public.workout_instances where id = 'b6000000-0000-4000-8000-000000000001'), 1, 'instance stores the source program revision snapshot');
select is((select position::text || '|' || planned_sets::text || '|' || coalesce(planned_reps, 'null') || '|' || skipped::text from public.workout_exercises where id = 'c6000000-0000-4000-8000-000000000004'), '50|0|null|false', 'journal can store an unplanned added exercise beyond template positions');
select throws_ok($$insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, seconds, author_user_id, device_id) values (gen_random_uuid(), '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 1, 20, '56000000-0000-4000-8000-000000000001', gen_random_uuid())$$, '23514', null, 'seconds cannot be recorded against a repetition exercise');
select throws_ok($$insert into public.private_notes (id, workspace_id, text, author_user_id, device_id) values (gen_random_uuid(), '66000000-0000-4000-8000-000000000001', 'Unscoped', '56000000-0000-4000-8000-000000000001', gen_random_uuid())$$, '23514', null, 'private note must have a workout or client scope');
select throws_ok($$insert into public.private_notes (id, workspace_id, workout_instance_id, client_record_id, text, author_user_id, device_id) values (gen_random_uuid(), '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'Two scopes', '56000000-0000-4000-8000-000000000001', gen_random_uuid())$$, '23514', null, 'private note has exactly one scope');
select throws_ok($$update public.workout_instances set client_record_id = '76000000-0000-4000-8000-000000000002' where id = 'b6000000-0000-4000-8000-000000000001'$$, '23503', null, 'instance cannot use another booking participant client id');
select throws_ok($$insert into public.workout_instances (id, workspace_id, booking_id, client_record_id) values (gen_random_uuid(), '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000004', '76000000-0000-4000-8000-000000000003')$$, '23503', null, 'instance cannot cross workspace bookings');
select throws_ok($$update public.workout_instances set source_program_id = 'a7000000-0000-4000-8000-000000000002' where id = 'b6000000-0000-4000-8000-000000000001'$$, '23503', null, 'instance cannot use another clients program');
select throws_ok($$update public.workout_instances set source_program_id = 'a7000000-0000-4000-8000-000000000003' where id = 'b6000000-0000-4000-8000-000000000001'$$, '23503', null, 'instance cannot use another workspace program');
select throws_ok($$insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_reps, replaced_from_id) values (gen_random_uuid(), '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002', current_setting('test.reps_exercise')::uuid, 'Bad replacement', 'reps', false, 'Legs', 'barbell', '{}', 1, 2, '5', 'c6000000-0000-4000-8000-000000000001')$$, '23503', null, 'replacement source must belong to the same workout instance');

insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets)
select 'c6000000-0000-4000-8000-000000000005', workspace_id, 'b6000000-0000-4000-8000-000000000003', exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, 0, 0
from public.workout_exercises where id = 'c6000000-0000-4000-8000-000000000001';
insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, reps, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000003', 'c6000000-0000-4000-8000-000000000005', 0, 8, '56000000-0000-4000-8000-000000000001', gen_random_uuid());
insert into public.session_notes (id, workspace_id, workout_instance_id, text, author_user_id, device_id)
values (gen_random_uuid(), '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000003', 'Unfinished note must stay hidden', '56000000-0000-4000-8000-000000000001', gen_random_uuid());

select set_config('request.jwt.claims', '{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workout_instances), 3, 'owner sees all own instances including drafts');
select is((select count(*)::integer from public.workout_exercises), 5, 'owner sees all own exercise snapshots');
select is((select count(*)::integer from public.set_results), 4, 'owner sees all own results');
select is((select count(*)::integer from public.session_notes), 2, 'owner sees shared session notes');
select is((select count(*)::integer from public.private_notes), 2, 'owner sees private notes');
select is((select count(*)::integer from public.sync_operations), 1, 'owner sees operation receipts');
reset role;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workout_instances), 1, 'client sees own finished instance');
select is((select count(*)::integer from public.workout_exercises), 3, 'client sees own finished exercise snapshots');
select is((select count(*)::integer from public.set_results), 3, 'client sees own finished results');
select is((select count(*)::integer from public.session_notes), 1, 'client sees public session note on own finished instance');
select is((select count(*)::integer from public.private_notes), 0, 'client never sees private notes');
select is((select count(*)::integer from public.sync_operations), 0, 'client cannot see potentially private operation receipts');
select is((select count(*)::integer from public.workout_instances where id = 'b6000000-0000-4000-8000-000000000003'), 0, 'client cannot see own unfinished instance');
select is((select count(*)::integer from public.workout_instances where id = 'b6000000-0000-4000-8000-000000000002'), 0, 'client cannot see another participant in their group');
select throws_ok($$insert into public.session_notes (workspace_id, workout_instance_id, text, author_user_id, device_id) values ('66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Client write', '56000000-0000-4000-8000-000000000003', gen_random_uuid())$$, '42501', null, 'client cannot write shared notes');
reset role;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workout_instances), 1, 'group peer sees only their own finished instance');
select is((select count(*)::integer from public.set_results), 0, 'group peer cannot see another participants sets');
reset role;

select set_config('request.jwt.claims', '{"sub":"56000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.workout_instances), 1, 'different owner sees only own workspace journal');
select is((select count(*)::integer from public.private_notes), 0, 'different owner cannot see foreign private notes');
select is((select count(*)::integer from public.sync_operations), 0, 'different owner cannot see foreign operation receipts');
reset role;

select * from finish();
rollback;
