begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(41);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('54000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'commands-trainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('54000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'commands-trainer-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (user_id, display_name) values
  ('54000000-0000-4000-8000-000000000001', 'Commands A'), ('54000000-0000-4000-8000-000000000002', 'Commands B');
insert into public.trainer_workspaces (id, owner_user_id, name) values
  ('64000000-0000-4000-8000-000000000001', '54000000-0000-4000-8000-000000000001', 'Commands workspace A'),
  ('64000000-0000-4000-8000-000000000002', '54000000-0000-4000-8000-000000000002', 'Commands workspace B');
select set_config('test.foreign_exercise_id', (select id::text from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000002' and source_key = 'e0'), true);

select ok(not has_table_privilege('authenticated', 'public.workout_templates', 'INSERT'), 'templates can only be written through commands');
select ok(not has_table_privilege('authenticated', 'public.template_exercises', 'DELETE'), 'template lines can only be replaced through commands');
select ok(not has_column_privilege('authenticated', 'public.workout_templates', 'name', 'UPDATE'), 'template metadata column grants are closed');
select ok(not has_column_privilege('authenticated', 'public.template_exercises', 'planned_reps', 'UPDATE'), 'template line column grants are closed');
select ok(not has_table_privilege('authenticated', 'private.template_command_receipts', 'SELECT'), 'receipts are private');
select ok(not has_function_privilege('anon', 'public.save_workout_template(uuid,integer,text,text,jsonb,uuid)', 'EXECUTE'), 'anonymous callers cannot save templates');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$insert into public.workout_templates (workspace_id, name, description) values ('64000000-0000-4000-8000-000000000001', 'Direct write', '')$$, '42501', null, 'direct template insert is denied despite old column grants');
select set_config('test.template_result', public.save_workout_template(
  null, null, '  Atomic    plan  ', '  A description  ',
  jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 20000, 'rest_seconds', 60, 'note', 'Warm up'),
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e69'), 'planned_sets', 2, 'planned_seconds', '30–45', 'rest_seconds', 90)
  ), '95000000-0000-4000-8000-000000000001'
)::text, true);
select set_config('test.template_id', (current_setting('test.template_result')::jsonb->>'id'), true);
select is((current_setting('test.template_result')::jsonb->>'revision')::integer, (select revision from public.workout_templates where id = current_setting('test.template_id')::uuid), 'save returns final revision after every child is inserted');
select is((select name from public.workout_templates where id = current_setting('test.template_id')::uuid), 'Atomic plan', 'template names collapse whitespace before length validation');
select is((select count(*)::integer from public.template_exercises where template_id = current_setting('test.template_id')::uuid), 2, 'RPC atomically creates ordered exercise lines');
select is((select position from public.template_exercises where template_id = current_setting('test.template_id')::uuid order by position limit 1), 0, 'first exercise follows JSON array order');
select is((select planned_weight_g from public.template_exercises where template_id = current_setting('test.template_id')::uuid and position = 0), 20000, 'weight is stored in grams');
select is((select planned_reps from public.template_exercises where template_id = current_setting('test.template_id')::uuid and position = 0), '8–12', 'repetition range is retained');
select is((select rest_seconds from public.template_exercises where template_id = current_setting('test.template_id')::uuid and position = 0), 60, 'rest duration is retained');
select is((select planned_seconds from public.template_exercises where template_id = current_setting('test.template_id')::uuid and position = 1), '30–45', 'timed range is retained');
select is((select note from public.template_exercises where template_id = current_setting('test.template_id')::uuid and position = 0), 'Warm up', 'exercise note is retained');
select throws_ok($$update public.template_exercises set planned_reps = '9' where template_id = current_setting('test.template_id')::uuid$$, '42501', null, 'direct template line update is denied');

select is((public.save_workout_template(null, null, '  Atomic    plan  ', '  A description  ',
  jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 20000, 'rest_seconds', 60, 'note', 'Warm up'),
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e69'), 'planned_sets', 2, 'planned_seconds', '30–45', 'rest_seconds', 90)
  ), '95000000-0000-4000-8000-000000000001')->>'id'), current_setting('test.template_id'), 'identical request replays the original template id');
select is((public.save_workout_template(null, null, '  Atomic    plan  ', '  A description  ',
  jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 20000, 'rest_seconds', 60, 'note', 'Warm up'),
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e69'), 'planned_sets', 2, 'planned_seconds', '30–45', 'rest_seconds', 90)
  ), '95000000-0000-4000-8000-000000000001')->>'replayed'), 'true', 'successful retries report replayed true');
select throws_ok($$select public.save_workout_template(null, null, 'Changed payload', '', '[]'::jsonb, '95000000-0000-4000-8000-000000000001')$$, '22023', null, 'reusing a key with a different payload is rejected');

select throws_ok($$select public.save_workout_template(current_setting('test.template_id')::uuid, 99, 'Stale', '', jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 3, 'planned_reps', '8')), '95000000-0000-4000-8000-000000000002')$$, '40001', null, 'valid save payload with stale revision is rejected');
select is((select count(*)::integer from public.template_exercises where template_id = current_setting('test.template_id')::uuid), 2, 'stale save leaves every original line intact');
select set_config('test.before_invalid_revision', (select revision::text from public.workout_templates where id = current_setting('test.template_id')::uuid), true);
select throws_ok($$select public.save_workout_template(current_setting('test.template_id')::uuid, (select revision from public.workout_templates where id = current_setting('test.template_id')::uuid), 'Should roll back', '', jsonb_build_array(jsonb_build_object('exercise_id', current_setting('test.foreign_exercise_id')::uuid, 'planned_sets', 3, 'planned_reps', '8')), '95000000-0000-4000-8000-000000000003')$$, '23503', null, 'foreign workspace exercise is rejected');
select is((select count(*)::integer from public.template_exercises where template_id = current_setting('test.template_id')::uuid), 2, 'invalid replacement rolls back deletion of original lines');
select is((select name from public.workout_templates where id = current_setting('test.template_id')::uuid), 'Atomic plan', 'failed replacement rolls back metadata as well as lines');
select is((select revision from public.workout_templates where id = current_setting('test.template_id')::uuid), current_setting('test.before_invalid_revision')::integer, 'failed replacement does not advance revision');
select set_config('test.reordered', public.save_workout_template(current_setting('test.template_id')::uuid,
  (select revision from public.workout_templates where id = current_setting('test.template_id')::uuid), 'Atomic plan', '',
  (select jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'planned_sets', planned_sets, 'planned_reps', planned_reps, 'planned_seconds', planned_seconds, 'planned_weight_g', planned_weight_g, 'rest_seconds', rest_seconds, 'note', note) order by position desc)
   from public.template_exercises where template_id = current_setting('test.template_id')::uuid), gen_random_uuid())::text, true);
select is((select exercise_id from public.template_exercises where template_id = current_setting('test.template_id')::uuid and position = 0), (select id from public.exercises where source_key = 'e69'), 'editing a template persists reversed exercise order');
select lives_ok($$update public.exercises set archived_at = now() where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'$$, 'referenced exercise can be archived');
select lives_ok($$select public.save_workout_template(current_setting('test.template_id')::uuid, (select revision from public.workout_templates where id = current_setting('test.template_id')::uuid), 'Atomic plan', '  A description  ',
  jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 20000, 'rest_seconds', 60, 'note', 'Warm up'),
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e69'), 'planned_sets', 2, 'planned_seconds', '30–45', 'rest_seconds', 90)
  ), '95000000-0000-4000-8000-000000000005')$$, 'existing template may retain its archived exercise');
select set_config('test.copy_result', public.save_workout_template(null, null, 'Archived copy', '',
  jsonb_build_array(jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 3, 'planned_reps', '8')), '95000000-0000-4000-8000-000000000006')::text, true);
select ok(exists (select 1 from public.template_exercises where template_id = (current_setting('test.copy_result')::jsonb->>'id')::uuid), 'a new template may reference an archived exercise');
select is((select count(*)::integer from public.template_exercises where template_id = current_setting('test.template_id')::uuid), 2, 'existing archived exercise lines remain intact');

select set_config('test.before_archive_revision', (select revision::text from public.workout_templates where id = current_setting('test.template_id')::uuid), true);
select throws_ok($$select public.archive_workout_template(current_setting('test.template_id')::uuid, 1, '95000000-0000-4000-8000-000000000007')$$, '40001', null, 'stale archive revision is rejected');
select ok((select archived_at is null from public.workout_templates where id = current_setting('test.template_id')::uuid), 'stale archive leaves the template active');
select set_config('test.archive_result', public.archive_workout_template(current_setting('test.template_id')::uuid, (select revision from public.workout_templates where id = current_setting('test.template_id')::uuid), '95000000-0000-4000-8000-000000000004')::text, true);
select is((current_setting('test.archive_result')::jsonb->>'revision')::integer, (current_setting('test.before_archive_revision')::integer + 1), 'archive increments exactly once and returns final revision');
select ok((select archived_at is not null from public.workout_templates where id = current_setting('test.template_id')::uuid), 'archive keeps the template row');
select is((select count(*)::integer from public.template_exercises where template_id = current_setting('test.template_id')::uuid), 2, 'archive retains template exercise history');
select is((public.archive_workout_template(current_setting('test.template_id')::uuid, current_setting('test.before_archive_revision')::integer, '95000000-0000-4000-8000-000000000004')->>'replayed'), 'true', 'archive retry replays before revision checks');
reset role;
select set_config('test.original_payload', (select payload::text from private.template_command_receipts where workspace_id = '64000000-0000-4000-8000-000000000001' and request_id = '95000000-0000-4000-8000-000000000001'), true);
set local role authenticated;
select is((public.save_workout_template(null, null,
  current_setting('test.original_payload')::jsonb->>'name', current_setting('test.original_payload')::jsonb->>'description',
  current_setting('test.original_payload')::jsonb->'exercises', '95000000-0000-4000-8000-000000000001')->>'revision')::integer,
  (current_setting('test.template_result')::jsonb->>'revision')::integer, 'retry after later edits and archive returns the original immutable result');
select throws_ok($$select payload from private.template_command_receipts$$, '42501', null, 'private receipts cannot be fetched through an authenticated query');
select set_config('request.jwt.claims', '{"sub":"54000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.save_workout_template(current_setting('test.template_id')::uuid, 1, 'Foreign edit', '', jsonb_build_array(jsonb_build_object('exercise_id', current_setting('test.foreign_exercise_id'), 'planned_sets', 3, 'planned_reps', '8')), gen_random_uuid())$$, 'P0002', null, 'another trainer cannot edit a known template ID');
select throws_ok($$select public.archive_workout_template((current_setting('test.copy_result')::jsonb->>'id')::uuid, 1, gen_random_uuid())$$, 'P0002', null, 'another trainer cannot archive a known template ID');
reset role;
select * from finish();
rollback;
