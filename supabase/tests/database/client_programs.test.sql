begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(37);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('55000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'program-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'program-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'program-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('55000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'program-client-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('55000000-0000-4000-8000-000000000001', 'Program trainer A'),
  ('55000000-0000-4000-8000-000000000002', 'Program trainer B'),
  ('55000000-0000-4000-8000-000000000003', 'Program client A'),
  ('55000000-0000-4000-8000-000000000004', 'Program client B');

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('65000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000001', 'Program workspace A'),
  ('65000000-0000-4000-8000-000000000002', '55000000-0000-4000-8000-000000000002', 'Program workspace B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('75000000-0000-4000-8000-000000000001', '65000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000003', 'Program client A'),
  ('75000000-0000-4000-8000-000000000002', '65000000-0000-4000-8000-000000000001', '55000000-0000-4000-8000-000000000004', 'Program client B'),
  ('75000000-0000-4000-8000-000000000003', '65000000-0000-4000-8000-000000000002', null, 'Foreign program client');

insert into public.workout_templates (id, workspace_id, name)
values ('85000000-0000-4000-8000-000000000099', '65000000-0000-4000-8000-000000000002', 'Foreign template');
insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps)
select '65000000-0000-4000-8000-000000000002', '85000000-0000-4000-8000-000000000099', e.id, 0, 3, '8'
from public.exercises e where e.workspace_id = '65000000-0000-4000-8000-000000000002' and e.source_key = 'e0';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.template_result', public.save_workout_template(null, null, 'Strength plan', 'Initial description',
  jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '65000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 20000, 'rest_seconds', 60, 'note', 'Warm up'),
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '65000000-0000-4000-8000-000000000001' and source_key = 'e69'), 'planned_sets', 2, 'planned_seconds', '30–45', 'rest_seconds', 90, 'note', 'Finish')
  ), '85000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.template_id', current_setting('test.template_result')::jsonb->>'id', true);
select set_config('test.template_revision', current_setting('test.template_result')::jsonb->>'revision', true);
select set_config('test.first_result', public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid,
  current_setting('test.template_revision')::integer, '85000000-0000-4000-8000-000000000002')::text, true);
select set_config('test.first_program_id', current_setting('test.first_result')::jsonb->>'id', true);
select set_config('test.peer_result', public.assign_client_program('75000000-0000-4000-8000-000000000002', current_setting('test.template_id')::uuid,
  current_setting('test.template_revision')::integer, '85000000-0000-4000-8000-000000000003')::text, true);
select set_config('test.peer_program_id', current_setting('test.peer_result')::jsonb->>'id', true);

select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.client_programs'::regclass, 'public.client_program_exercises'::regclass)), 'both program tables enable RLS');
select ok(not has_table_privilege('authenticated', 'public.client_programs', 'INSERT'), 'authenticated cannot directly insert programs');
select ok(not has_table_privilege('authenticated', 'public.client_programs', 'UPDATE'), 'authenticated cannot directly update programs');
select ok(not has_table_privilege('authenticated', 'public.client_program_exercises', 'INSERT'), 'authenticated cannot directly insert program exercises');
select ok(not has_table_privilege('authenticated', 'public.client_program_exercises', 'DELETE'), 'authenticated cannot directly delete program exercises');
select is((current_setting('test.first_result')::jsonb->>'replayed'), 'false', 'first assignment creates a fresh snapshot');
select is((current_setting('test.first_result')::jsonb->>'revision')::integer, 1, 'new program starts at revision one');
select is((select name || '|' || description || '|' || base_template_revision::text from public.client_programs where id = current_setting('test.first_program_id')::uuid),
  'Strength plan|Initial description|' || current_setting('test.template_revision'), 'program keeps template name, description, and actual source revision');
select is((select count(*)::integer from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid), 2, 'all template exercises copy into the program');
select is((select exercise_name_snapshot from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid and position = 0), 'Приседания со штангой', 'items preserve source order');
select is((select measure_snapshot || '|' || bodyweight_snapshot::text || '|' || muscle_group_snapshot || '|' || equipment_snapshot || '|' || source_key_snapshot from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid and position = 0),
  'reps|false|Ноги|штанга|e0', 'items snapshot exercise metadata for clients');
select is((select planned_sets::text || '|' || planned_reps || '|' || planned_weight_g::text || '|' || rest_seconds::text || '|' || note from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid and position = 0),
  '4|8–12|20000|60|Warm up', 'items preserve planned values and note');
select is((public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid, current_setting('test.template_revision')::integer, '85000000-0000-4000-8000-000000000002')->>'id'), current_setting('test.first_program_id'), 'same request replays its original program id');
select is((public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid, current_setting('test.template_revision')::integer, '85000000-0000-4000-8000-000000000002')->>'replayed'), 'true', 'retry reports replayed true');
select throws_ok($$select public.assign_client_program('75000000-0000-4000-8000-000000000002', current_setting('test.template_id')::uuid, current_setting('test.template_revision')::integer, '85000000-0000-4000-8000-000000000002')$$, '22023', null, 'request id cannot be reused for a different client');
select throws_ok($$select public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid, 999, '85000000-0000-4000-8000-000000000004')$$, '40001', null, 'stale source revision is rejected');
select throws_ok($$select public.assign_client_program('75000000-0000-4000-8000-000000000001', '85000000-0000-4000-8000-000000000099', 2, '85000000-0000-4000-8000-000000000008')$$, 'P0002', null, 'owner cannot assign a template from another workspace');
select throws_ok($$select public.assign_client_program('75000000-0000-4000-8000-000000000003', current_setting('test.template_id')::uuid, current_setting('test.template_revision')::integer, gen_random_uuid())$$, 'P0002', null, 'owner cannot assign own template to a foreign client');
select is((select measure_snapshot || '|' || planned_seconds from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid and position = 1), 'seconds|30–45', 'timed exercise keeps seconds range');
select is((select count(*)::integer from public.client_programs where client_record_id = '75000000-0000-4000-8000-000000000001'), 1, 'failed stale assignment creates no partial program');
select throws_ok($$insert into public.client_programs (workspace_id, client_record_id, base_template_id, base_template_revision, name) values ('65000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid, 1, 'Direct')$$, '42501', null, 'direct program insert is denied');
select throws_ok($$update public.client_programs set name = 'Direct edit' where id = current_setting('test.first_program_id')::uuid$$, '42501', null, 'direct program update is denied');
select throws_ok($$delete from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid$$, '42501', null, 'direct exercise delete is denied');

select set_config('test.updated_template_result', public.save_workout_template(current_setting('test.template_id')::uuid,
  current_setting('test.template_revision')::integer, 'Updated plan', 'Changed description',
  jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '65000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 3, 'planned_reps', '6–8', 'planned_weight_g', 25000, 'rest_seconds', 75, 'note', 'New note')),
  '85000000-0000-4000-8000-000000000005')::text, true);
select set_config('test.new_revision', current_setting('test.updated_template_result')::jsonb->>'revision', true);
select set_config('test.second_result', public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid,
  current_setting('test.new_revision')::integer, '85000000-0000-4000-8000-000000000006')::text, true);
select is((current_setting('test.second_result')::jsonb->>'id') <> current_setting('test.first_program_id'), true, 'reassignment creates a distinct copy');
select is((select name || '|' || description || '|' || base_template_revision::text from public.client_programs where id = (current_setting('test.second_result')::jsonb->>'id')::uuid), 'Updated plan|Changed description|' || current_setting('test.new_revision'), 'new copy captures updated template and revision');
select is((select name || '|' || description from public.client_programs where id = current_setting('test.first_program_id')::uuid), 'Strength plan|Initial description', 'previous program metadata remains unchanged');
select is((select planned_sets::text || '|' || planned_reps || '|' || note from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid and position = 0), '4|8–12|Warm up', 'previous program exercises remain unchanged');
select lives_ok($$update public.exercises set name = 'Renamed after assignment', archived_at = now() where workspace_id = '65000000-0000-4000-8000-000000000001' and source_key = 'e0'$$, 'source exercise can later be renamed and archived');
select is((select exercise_name_snapshot from public.client_program_exercises where client_program_id = current_setting('test.first_program_id')::uuid and position = 0), 'Приседания со штангой', 'exercise rename does not alter existing snapshot');
select set_config('test.archive_result', public.archive_workout_template(current_setting('test.template_id')::uuid, current_setting('test.new_revision')::integer, '85000000-0000-4000-8000-000000000007')::text, true);
select is((public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid, current_setting('test.template_revision')::integer, '85000000-0000-4000-8000-000000000002')->>'id'), current_setting('test.first_program_id'), 'successful request retry remains available after template archive');
reset role;

select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.client_programs), 2, 'client sees both own assignment snapshots despite peer sharing workspace');
select is((select count(*)::integer from public.client_program_exercises), 3, 'client sees only exercises from their own snapshots');
select is((select count(*)::integer from public.exercises), 0, 'client cannot read trainer exercise library');
select is((select count(*)::integer from public.client_programs where id = current_setting('test.peer_program_id')::uuid), 0, 'client cannot read a peer program');
select throws_ok($$select public.assign_client_program('75000000-0000-4000-8000-000000000003', current_setting('test.template_id')::uuid, 1, gen_random_uuid())$$, '42501', null, 'client cannot assign to a foreign workspace client');
reset role;
select set_config('request.jwt.claims', '{"sub":"55000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::integer from public.client_programs), 0, 'other workspace owner cannot read foreign client programs');
select throws_ok($$select public.assign_client_program('75000000-0000-4000-8000-000000000001', current_setting('test.template_id')::uuid, 1, gen_random_uuid())$$, 'P0002', null, 'other workspace owner cannot assign a known foreign template');
reset role;

select * from finish();
rollback;
