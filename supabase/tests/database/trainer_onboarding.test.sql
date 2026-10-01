begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(49);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('52000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'onboard-fresh@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'onboard-profile@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'onboard-workspace@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'onboard-other@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'onboard-atomic@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'onboard-client-atomic@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000007', 'authenticated', 'authenticated', 'onboard-invalid@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values ('52000000-0000-4000-8000-000000000002', 'Existing profile name');
insert into public.trainer_workspaces (id, owner_user_id, name)
values ('62000000-0000-4000-8000-000000000003', '52000000-0000-4000-8000-000000000003', 'Existing workspace name');

create function public.fail_on_onboarding_test_workspace()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.name = 'Onboarding atomic rollback fixture' then
    raise exception using errcode = 'P0001', message = 'forced onboarding workspace failure';
  end if;
  return new;
end;
$$;

create trigger trainer_onboarding_test_failure
before insert on public.trainer_workspaces
for each row execute function public.fail_on_onboarding_test_workspace();

create function public.fail_on_onboarding_test_client()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.display_name = 'Onboarding client rollback fixture' then
    raise exception using errcode = 'P0001', message = 'forced onboarding client failure';
  end if;
  return new;
end;
$$;

create trigger trainer_onboarding_test_client_failure
before insert on public.client_records
for each row execute function public.fail_on_onboarding_test_client();

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.complete_trainer_onboarding('  Ada Trainer  ', '  Ada Studio  ')->>'name',
  'Ada Studio',
  'first onboarding creates and returns a trimmed workspace'
);
select is((select display_name from public.profiles where user_id = auth.uid()), 'Ada Trainer', 'first onboarding creates the profile using the trimmed display name');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id = auth.uid()), 1, 'first onboarding creates exactly one workspace');
select is((select count(*)::integer from public.exercises e join public.trainer_workspaces w on w.id = e.workspace_id where w.owner_user_id = auth.uid()), 81, 'workspace creation seeds all 81 private catalog exercises');
select is(
  public.complete_trainer_onboarding('Changed Name', 'Changed Workspace')->>'name',
  'Ada Studio',
  'retry returns the original workspace without replacing its name'
);
select is((select display_name from public.profiles where user_id = auth.uid()), 'Ada Trainer', 'retry preserves the original profile name');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id = auth.uid()), 1, 'retry does not create a duplicate workspace');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id <> auth.uid()), 0, 'authenticated trainer cannot read another trainer workspace');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.complete_trainer_onboarding('Replacement input', 'Profile user workspace')$$, 'existing profile user can complete onboarding');
select is((select display_name from public.profiles where user_id = auth.uid()), 'Existing profile name', 'existing profile value is preserved');
select is((select name from public.trainer_workspaces where owner_user_id = auth.uid()), 'Profile user workspace', 'missing workspace is created for an existing profile');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id <> auth.uid()), 0, 'second trainer reads only their own workspace');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(public.complete_trainer_onboarding('New input', 'New workspace input')->>'id', '62000000-0000-4000-8000-000000000003', 'preexisting workspace id is returned');
select is((select name from public.trainer_workspaces where owner_user_id = auth.uid()), 'Existing workspace name', 'preexisting workspace name is preserved');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select lives_ok(
  $$select public.complete_trainer_onboarding(
    'Preferences trainer', 'Preferences workspace',
    array['yoga','strength','yoga'], array[6,1,6], '08:30', '18:15', 90,
    '  Client Ada  ', ' 555-0101 '
  )$$,
  'onboarding accepts normalized preferences and an optional first client'
);
select is((select training_focus::text from public.trainer_workspaces where owner_user_id = auth.uid()), '{strength,yoga}', 'focus values are deduplicated and sorted');
select is((select working_days::text from public.trainer_workspaces where owner_user_id = auth.uid()), '{1,6}', 'working days are deduplicated and sorted');
select is((select day_start::text || '|' || day_end::text from public.trainer_workspaces where owner_user_id = auth.uid()), '08:30:00|18:15:00', 'working interval is saved');
select is((select usual_session_minutes from public.trainer_workspaces where owner_user_id = auth.uid()), 90, 'usual session length is saved');
select is((select display_name || '|' || phone || '|' || (user_id is null)::text from public.client_records where workspace_id = (select id from public.trainer_workspaces where owner_user_id = auth.uid())), 'Client Ada|555-0101|true', 'first client is trimmed and remains unlinked');
select lives_ok(
  $$select public.complete_trainer_onboarding(
    'Changed trainer', 'Changed workspace',
    array['boxing'], array[2], '09:00', '17:00', 45,
    'Changed client', '999'
  )$$,
  'retry with changed onboarding payload succeeds'
);
select ok((select training_focus = array['strength','yoga']::text[] and working_days = array[1,6]::integer[] and day_start = '08:30' and day_end = '18:15' and usual_session_minutes = 90 from public.trainer_workspaces where owner_user_id = auth.uid()), 'retry preserves saved trainer preferences');
select is((select count(*)::integer from public.client_records where workspace_id = (select id from public.trainer_workspaces where owner_user_id = auth.uid())), 1, 'retry does not create a duplicate first client');
select is((select display_name || '|' || phone from public.client_records where workspace_id = (select id from public.trainer_workspaces where owner_user_id = auth.uid())), 'Client Ada|555-0101', 'retry preserves the original first client');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000007","role":"authenticated"}', true);
select throws_ok($$select public.complete_trainer_onboarding('', 'Other workspace')$$, '22023', null, 'empty display name is rejected');
select throws_ok($$select public.complete_trainer_onboarding(repeat('x', 121), 'Other workspace')$$, '22023', null, 'display name over 120 characters is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Other user', '   ')$$, '22023', null, 'blank workspace name is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Other user', repeat('x', 121))$$, '22023', null, 'workspace name over 120 characters is rejected');
select throws_ok($$select public.complete_trainer_onboarding(null, 'Other workspace')$$, '22023', null, 'null display name is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Other user', null)$$, '22023', null, 'null workspace name is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[]::integer[])$$, '22023', null, 'empty working-day list is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['unknown'], array[1])$$, '22023', null, 'unknown focus is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[1], '21:00', '07:00')$$, '22023', null, 'reversed working interval is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[1], null, '17:00')$$, '22023', null, 'null working time is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[1], '07:00', '17:00', 75)$$, '22023', null, 'unsupported session length is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[1], '07:00', '17:00', 60, repeat('x', 121))$$, '22023', null, 'first client name over 120 characters is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[1], '07:00', '17:00', 60, null, '123')$$, '22023', null, 'first client phone without a name is rejected');
select throws_ok($$select public.complete_trainer_onboarding('Invalid prefs', 'Invalid prefs workspace', array['strength'], array[1], '07:00', '17:00', 60, 'Client', repeat('1', 81))$$, '22023', null, 'first client phone over 80 characters is rejected');
select is((select count(*)::integer from public.profiles where user_id = auth.uid()), 0, 'invalid inputs create no profile');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id = auth.uid()), 0, 'invalid inputs create no workspace');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.complete_trainer_onboarding('Missing identity', 'No workspace')$$, '42501', null, 'authenticated role without uid is denied');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok($$select public.complete_trainer_onboarding('Atomic trainer', 'Onboarding atomic rollback fixture')$$, 'P0001', null, 'workspace failure is surfaced');
select is((select count(*)::integer from public.profiles where user_id = auth.uid()), 0, 'workspace failure rolls back profile creation');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id = auth.uid()), 0, 'workspace failure leaves no workspace');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000006","role":"authenticated"}', true);
select throws_ok(
  $$select public.complete_trainer_onboarding('Client atomic trainer', 'Client atomic workspace', array['strength'], array[1], '07:00', '17:00', 60, 'Onboarding client rollback fixture', '123')$$,
  'P0001', null,
  'late first-client insert failure is surfaced'
);
select is((select count(*)::integer from public.profiles where user_id = auth.uid()), 0, 'late client failure rolls back profile creation');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id = auth.uid()), 0, 'late client failure rolls back workspace creation');
select is((select count(*)::integer from public.exercises e join public.trainer_workspaces w on w.id = e.workspace_id where w.owner_user_id = auth.uid()), 0, 'late client failure rolls back all seeded exercises');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.complete_trainer_onboarding('Anonymous', 'Anonymous workspace')$$, '42501', null, 'anonymous caller is denied execution');

select * from finish();
rollback;
