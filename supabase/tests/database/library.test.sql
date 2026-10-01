begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(40);

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
select lives_ok(
  $$insert into public.workout_templates (workspace_id, name, description)
    values ('61000000-0000-4000-8000-000000000001', '  Моя   программа  ', 'Template test')$$,
  'trainer can create a template'
);
select throws_ok(
  $$insert into public.workout_templates (workspace_id, name)
    values ('61000000-0000-4000-8000-000000000001', 'МОЯ ПРОГРАММА')$$,
  '23505', null,
  'active template names are unique after case normalization'
);
select lives_ok(
  $$insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps, planned_weight_g, rest_seconds)
    select '61000000-0000-4000-8000-000000000001', t.id, e.id, 0, 4, '8–12', 20000, 60
    from public.workout_templates t cross join public.exercises e
    where t.workspace_id = '61000000-0000-4000-8000-000000000001' and t.name = 'Моя программа'
      and e.workspace_id = t.workspace_id and e.name = 'Моя Ёлка'$$,
  'trainer can add a measured exercise to their template'
);
select is((select revision from public.workout_templates where workspace_id = '61000000-0000-4000-8000-000000000001' and name = 'Моя программа'), 2, 'adding a template exercise increments parent revision');
with changed as (
  update public.template_exercises te set planned_reps = '10', rest_seconds = 90
  from public.workout_templates t, public.exercises e
  where te.workspace_id = t.workspace_id and te.template_id = t.id
    and te.workspace_id = e.workspace_id and te.exercise_id = e.id
    and t.name = 'Моя программа' and e.name = 'Моя Ёлка'
  returning te.revision
)
select is((select max(revision) from changed), 2, 'template exercise update increments its revision');
select is((select revision from public.workout_templates where workspace_id = '61000000-0000-4000-8000-000000000001' and name = 'Моя программа'), 3, 'template exercise update increments parent revision');
select throws_ok(
  $$insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps)
    select '61000000-0000-4000-8000-000000000001', t.id, '81000000-0000-4000-8000-000000000002', 1, 3, '8'
    from public.workout_templates t where t.workspace_id = '61000000-0000-4000-8000-000000000001' and t.name = 'Моя программа'$$,
  '23503', null,
  'composite foreign keys reject an exercise from another workspace'
);
select is(public.normalize_library_name(E'\t  ЁЛКА  \n'), 'елка', 'normalization trims tabs and newlines after collapsing whitespace');
select is((select count(*)::integer from public.search_exercises('МОЯ ЕЛКА')), 1, 'search treats Cyrillic case and ё/е equally');
select lives_ok(
  $$insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_seconds)
    select t.workspace_id, t.id, e.id, 1, 2, '30–45'
    from public.workout_templates t join public.exercises e on e.workspace_id = t.workspace_id
    where t.name = 'Моя программа' and e.source_key = 'e69'$$,
  'timed plans preserve a seconds range'
);
select throws_ok(
  $$update public.template_exercises set planned_seconds = '45–30' where planned_seconds is not null$$,
  '23514', null, 'descending time ranges are rejected'
);
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
with changed as (
  update public.workout_templates set archived_at = now()
  where workspace_id = '61000000-0000-4000-8000-000000000001' and name = 'Моя программа'
  returning id
)
select is(
  (select count(*)::integer from changed),
  1,
  'trainer can archive their template'
);
select ok(exists (select 1 from public.workout_templates where workspace_id = '61000000-0000-4000-8000-000000000001' and name = 'Моя программа' and archived_at is not null), 'archived template remains readable');

select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.exercises), 0, 'client cannot read the trainer exercise library');
select is((select count(*)::integer from public.workout_templates), 0, 'client cannot read trainer templates');
select is((select count(*)::integer from public.template_exercises), 0, 'client cannot read trainer template exercises');
reset role;

select * from finish();
rollback;
