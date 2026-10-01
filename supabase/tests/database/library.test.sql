begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(30);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'library-trainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'library-trainer-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('51000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'library-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('51000000-0000-4000-8000-000000000001', 'Library trainer A'),
  ('51000000-0000-4000-8000-000000000002', 'Library trainer B'),
  ('51000000-0000-4000-8000-000000000003', 'Library client A');

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('61000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'Library workspace A'),
  ('61000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000002', 'Library workspace B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values ('71000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000003', 'Library client');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.exercises'::regclass,
    'public.workout_templates'::regclass,
    'public.template_exercises'::regclass
  )),
  'all library tables enable RLS'
);
select ok(not has_table_privilege('anon', 'public.exercises', 'SELECT'), 'anonymous role cannot read exercises');
select ok(not has_function_privilege('anon', 'public.search_exercises(text)', 'EXECUTE'), 'anonymous role cannot call exercise search');
select is((select count(*)::integer from public.exercises where workspace_id = '61000000-0000-4000-8000-000000000001'), 81, 'workspace creation copies all 81 starter exercises');
select is((select count(*)::integer from public.exercises where workspace_id = '61000000-0000-4000-8000-000000000002'), 81, 'each workspace receives its own starter catalog');
select is(
  (select count(*)::integer from public.exercises e join private.exercise_catalog c using (source_key)
   where e.workspace_id = '61000000-0000-4000-8000-000000000001'
     and (public.normalize_library_name(e.name) <> public.normalize_library_name(c.name)
       or e.muscle_group <> c.muscle_group or e.equipment <> c.equipment
       or e.measure <> c.measure or e.bodyweight <> c.bodyweight
       or e.aliases <> c.aliases or e.instructions <> c.instructions)),
  0,
  'starter exercise metadata matches the private catalog'
);
select ok(exists (
  select 1 from public.exercises
  where workspace_id = '61000000-0000-4000-8000-000000000001'
    and source_key = 'e69' and name = 'Ходьба на дорожке'
    and muscle_group = 'Кардио' and measure = 'seconds'
), 'timed cardio exercise keeps its canonical metadata');

insert into public.exercises (id, workspace_id, name, muscle_group, equipment, measure, bodyweight, created_by)
values ('81000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'Foreign fixture', 'Спина', 'Тренажер', 'reps', false, '51000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.exercises), 81, 'trainer reads only their own seeded exercises');
select is((select count(*)::integer from public.search_exercises('')), 81, 'owner-filtered search returns the trainer catalog');
select ok(not has_column_privilege('authenticated', 'public.exercises', 'source_key', 'INSERT'), 'trainer cannot assign catalog source keys');
select ok(not has_column_privilege('authenticated', 'public.exercises', 'measure', 'UPDATE'), 'trainer cannot change an exercise measure directly');
select ok(not has_column_privilege('authenticated', 'public.exercises', 'workspace_id', 'UPDATE'), 'trainer cannot move an exercise between workspaces');
select ok(not has_column_privilege('authenticated', 'public.workout_templates', 'revision', 'UPDATE'), 'trainer cannot write template revision directly');
select ok(not has_column_privilege('authenticated', 'public.template_exercises', 'workspace_id', 'UPDATE'), 'trainer cannot move a template exercise between workspaces');

select lives_ok(
  $$insert into public.exercises (workspace_id, name, muscle_group, equipment, measure, bodyweight, aliases, instructions)
    values ('61000000-0000-4000-8000-000000000001', '  Моя    Ёлка  ', 'Грудь', 'Штанга', 'reps', false, array['Тестовый жим'], array[]::text[])$$,
  'trainer can create a custom exercise'
);
select ok((select source_key is null and name = 'Моя Ёлка' from public.exercises where workspace_id = '61000000-0000-4000-8000-000000000001' and name = 'Моя Ёлка'), 'custom exercise is normalized and has no source key');
select is((select count(*)::integer from public.search_exercises('ТЕСТОВЫЙ ЖИМ')), 1, 'search matches an alias without case differences');
select throws_ok(
  $$insert into public.exercises (workspace_id, name, muscle_group, equipment, measure, bodyweight)
    values ('61000000-0000-4000-8000-000000000001', 'моя елка', 'Грудь', 'Штанга', 'reps', false)$$,
  '23505', null,
  'active exercise names are unique after case and ё normalization'
);
reset role;
insert into public.workout_templates (workspace_id, name, description)
values ('61000000-0000-4000-8000-000000000001', 'Archive fixture', 'Existing template');
insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps)
select t.workspace_id, t.id, e.id, 0, 3, '8–12'
from public.workout_templates t join public.exercises e on e.workspace_id = t.workspace_id
where t.name = 'Archive fixture' and e.name = 'Моя Ёлка';
select throws_ok(
  $$insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps)
    select t.workspace_id, t.id, '81000000-0000-4000-8000-000000000002', 1, 3, '8'
    from public.workout_templates t where t.name = 'Archive fixture'$$,
  '23503', null, 'schema rejects a cross-workspace exercise reference'
);
set local role authenticated;
select is(public.normalize_library_name(E'\t  ЁЛКА  \n'), 'елка', 'normalization trims tabs and newlines after collapsing whitespace');
select is((select count(*)::integer from public.search_exercises('МОЯ ЕЛКА')), 1, 'search treats Cyrillic case and ё/е equally');
select throws_ok(
  $$insert into public.exercises (workspace_id, name, muscle_group, equipment, measure)
    values ('61000000-0000-4000-8000-000000000002', 'Unauthorized exercise', 'Кор', 'вес тела', 'reps')$$,
  '42501', null, 'trainer cannot insert into another workspace'
);
select throws_ok(
  $$delete from public.exercises where name = 'Моя Ёлка'$$,
  '42501', null, 'physical deletion of a referenced exercise is forbidden'
);
with changed as (
  update public.exercises set archived_at = now()
  where workspace_id = '61000000-0000-4000-8000-000000000001' and name = 'Моя Ёлка'
  returning id
)
select is(
  (select count(*)::integer from changed),
  1,
  'trainer can archive a referenced exercise'
);
select ok(exists (
  select 1 from public.exercises e join public.template_exercises te
    on te.workspace_id = e.workspace_id and te.exercise_id = e.id
  where e.workspace_id = '61000000-0000-4000-8000-000000000001' and e.name = 'Моя Ёлка' and e.archived_at is not null
), 'archived exercise and historical template line remain readable');
select is((select count(*)::integer from public.search_exercises('ёлка')), 0, 'search excludes archived exercises');
select lives_ok(
  $$insert into public.exercises (workspace_id, name, muscle_group, equipment, measure, bodyweight)
    values ('61000000-0000-4000-8000-000000000001', 'моя елка', 'Грудь', 'Штанга', 'reps', false)$$,
  'an archived exercise name can be reused'
);
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.exercises), 0, 'client cannot read the trainer exercise library');
select is((select count(*)::integer from public.workout_templates), 0, 'client cannot read trainer templates');
select is((select count(*)::integer from public.template_exercises), 0, 'client cannot read trainer template exercises');
reset role;

select * from finish();
rollback;
