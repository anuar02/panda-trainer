begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('54300000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'template-editor@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.profiles (user_id, display_name) values ('54300000-0000-4000-8000-000000000001', 'Editor trainer');
insert into public.trainer_workspaces (id, owner_user_id, name) values ('64300000-0000-4000-8000-000000000001', '54300000-0000-4000-8000-000000000001', 'Editor workspace');
insert into public.exercises (id, workspace_id, name, muscle_group, equipment, measure, bodyweight)
values ('84300000-0000-4000-8000-000000000001', '64300000-0000-4000-8000-000000000001', 'Своя планка', 'Кор', 'коврик', 'seconds', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"54300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.editor_payload', jsonb_build_array(
  jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64300000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 42501, 'rest_seconds', 120, 'note', 'Контроль темпа'),
  jsonb_build_object('exercise_id', '84300000-0000-4000-8000-000000000001', 'planned_sets', 2, 'planned_seconds', '45–60', 'planned_weight_g', null, 'rest_seconds', 0, 'note', null),
  jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '64300000-0000-4000-8000-000000000001' and source_key = 'e1'), 'planned_sets', 1, 'planned_reps', '10', 'planned_weight_g', 0, 'rest_seconds', 0, 'note', null)
)::text, true);
select set_config('test.editor_result', public.save_workout_template(null, null, 'Низ А', 'Заметка', current_setting('test.editor_payload')::jsonb, '94300000-0000-4000-8000-000000000001')::text, true);
select set_config('test.editor_id', current_setting('test.editor_result')::jsonb->>'id', true);
select is((select count(*)::integer from public.template_exercises where template_id = current_setting('test.editor_id')::uuid), 3, 'create contains library and custom exercises');
select is((select planned_weight_g from public.template_exercises where template_id = current_setting('test.editor_id')::uuid and position = 0), 42501, 'single gram precision survives save and read');
select ok((select planned_weight_g is null and planned_reps is null and planned_seconds = '45–60' and rest_seconds = 0 and note is null from public.template_exercises where template_id = current_setting('test.editor_id')::uuid and position = 1), 'timed units null weight zero rest and null cue survive');
select is((select planned_weight_g from public.template_exercises where template_id = current_setting('test.editor_id')::uuid and position = 2), 0, 'explicit zero weight remains distinct from null');
select set_config('test.editor_reversed', (select jsonb_agg(value order by ordinality desc)::text from jsonb_array_elements(current_setting('test.editor_payload')::jsonb) with ordinality), true);
select set_config('test.editor_edit', public.save_workout_template(current_setting('test.editor_id')::uuid, (current_setting('test.editor_result')::jsonb->>'revision')::integer, 'Низ А', 'Правка', current_setting('test.editor_reversed')::jsonb, '94300000-0000-4000-8000-000000000002')::text, true);
select is((select note from public.template_exercises where template_id = current_setting('test.editor_id')::uuid and position = 2), 'Контроль темпа', 'editing reorders without losing cue');

reset role;
select set_config('test.editor_before_archive', (select jsonb_agg(to_jsonb(t) order by position)::text from public.template_exercises t where template_id = current_setting('test.editor_id')::uuid), true);
set local role authenticated;
update public.exercises set archived_at = now() where id = '84300000-0000-4000-8000-000000000001';
select set_config('test.editor_copy', public.save_workout_template(null, null, 'Низ А — копия', 'Правка', current_setting('test.editor_reversed')::jsonb, '94300000-0000-4000-8000-000000000003')::text, true);
select isnt(current_setting('test.editor_copy')::jsonb->>'id', current_setting('test.editor_id'), 'copy creates independent template id');
select is((select jsonb_agg(jsonb_build_object('exercise_id', exercise_id, 'planned_sets', planned_sets, 'planned_reps', planned_reps, 'planned_seconds', planned_seconds, 'planned_weight_g', planned_weight_g, 'rest_seconds', rest_seconds, 'note', note) order by position) from public.template_exercises where template_id = (current_setting('test.editor_copy')::jsonb->>'id')::uuid), current_setting('test.editor_reversed')::jsonb, 'archived copy reads exact reordered plan units null zero and cues');
select is(public.save_workout_template(null, null, 'Низ А — копия', 'Правка', current_setting('test.editor_reversed')::jsonb, '94300000-0000-4000-8000-000000000003'), (current_setting('test.editor_copy')::jsonb || '{"replayed":true}'::jsonb), 'exact id retry replays immutable copy receipt');
select is((select count(*)::integer from public.workout_templates where workspace_id = '64300000-0000-4000-8000-000000000001'), 2, 'receipt retry creates no duplicate template');
reset role;
select is((select jsonb_agg(to_jsonb(t) order by position) from public.template_exercises t where template_id = current_setting('test.editor_id')::uuid), current_setting('test.editor_before_archive')::jsonb, 'archive and copy leave original rows byte for byte unchanged');
select * from finish();
rollback;
