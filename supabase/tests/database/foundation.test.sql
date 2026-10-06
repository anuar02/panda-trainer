begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(31);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rls-trainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rls-trainer-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rls-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'rls-client-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('10000000-0000-4000-8000-000000000001', 'Trainer A'),
  ('10000000-0000-4000-8000-000000000002', 'Trainer B'),
  ('10000000-0000-4000-8000-000000000003', 'Client A'),
  ('10000000-0000-4000-8000-000000000004', 'Client B');

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Workspace A'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Workspace B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'Client A record'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'Client B record');

insert into public.invitations (id, client_record_id, token_hash, expires_at, created_by)
values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'hash-a', now() + interval '1 day', '10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'hash-b', now() + interval '1 day', '10000000-0000-4000-8000-000000000002');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.profiles'::regclass,
    'public.trainer_workspaces'::regclass,
    'public.client_records'::regclass,
    'public.invitations'::regclass
  )),
  'all identity and workspace tables enable RLS'
);
select ok(not has_column_privilege('authenticated', 'public.trainer_workspaces', 'owner_user_id', 'UPDATE'), 'workspace owner cannot be changed directly');
select ok(not has_column_privilege('authenticated', 'public.client_records', 'workspace_id', 'UPDATE'), 'client record cannot be moved to another workspace');
select ok(not has_column_privilege('authenticated', 'public.client_records', 'user_id', 'UPDATE'), 'client linkage cannot be changed directly');
select ok(not has_column_privilege('authenticated', 'public.client_records', 'user_id', 'INSERT'), 'client cannot be linked during direct record creation');
select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT'), 'invitation token hash is not selectable');
select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'UPDATE'), 'invitation token hash cannot be changed directly');
select ok(not has_table_privilege('authenticated', 'public.invitations', 'INSERT'), 'invitations cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.invitations', 'UPDATE'), 'invitation acceptance cannot be changed directly');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE'), 'profile identity cannot be reassigned');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.trainer_workspaces), 1, 'trainer sees only their workspace');
select is((select count(*)::integer from public.client_records), 1, 'trainer sees only records in their workspace');
select ok(exists (select 1 from public.client_records where id = '30000000-0000-4000-8000-000000000001'), 'trainer can read a known record in their workspace');
select ok(not exists (select 1 from public.client_records where id = '30000000-0000-4000-8000-000000000002'), 'trainer cannot read a known foreign record');
select is((select count(id)::integer from public.invitations), 1, 'trainer sees only safe invitation metadata in their workspace');
select throws_ok(
  $$select token_hash from public.invitations where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'trainer cannot read an invitation token hash'
);
select is((select count(*)::integer from public.profiles), 1, 'trainer sees only their own profile');
select lives_ok(
  $$insert into public.client_records (workspace_id, display_name) values ('20000000-0000-4000-8000-000000000001', 'Trainer created record')$$,
  'trainer can insert a record in their workspace'
);
with changed as (
  update public.client_records
  set display_name = 'Trainer updated record'
  where workspace_id = '20000000-0000-4000-8000-000000000001'
    and display_name = 'Trainer created record'
  returning revision
)
select is(
  (select max(revision)::integer from changed),
  2,
  'trainer can update their record and revision increments'
);
with changed as (
  update public.client_records
  set display_name = 'Incorrectly changed'
  where id = '30000000-0000-4000-8000-000000000002'
  returning id
)
select is(
  (select count(*)::integer from changed),
  0,
  'trainer update against a foreign record affects zero rows'
);
select throws_ok(
  $$insert into public.client_records (workspace_id, display_name) values ('20000000-0000-4000-8000-000000000002', 'Foreign workspace insert')$$,
  '42501', null,
  'trainer cannot insert into a foreign workspace'
);
select throws_ok(
  $$update public.client_records set user_id = '10000000-0000-4000-8000-000000000004' where id = '30000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'trainer cannot directly link a client account'
);
select throws_ok(
  $$update public.trainer_workspaces set owner_user_id = '10000000-0000-4000-8000-000000000002' where id = '20000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'trainer cannot directly reassign workspace ownership'
);
select throws_ok(
  $$update public.invitations set token_hash = 'replacement' where id = '40000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'trainer cannot directly edit invitation tokens'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.client_records), 1, 'client sees only their linked client record');
select ok(exists (select 1 from public.client_records where id = '30000000-0000-4000-8000-000000000001'), 'client can read their known linked record');
select ok(not exists (select 1 from public.client_records where id = '30000000-0000-4000-8000-000000000002'), 'client cannot read a known foreign record');
select is((select count(id)::integer from public.invitations), 0, 'client cannot see invitation metadata');
with changed as (
  update public.client_records
  set display_name = 'Client changed record'
  where id = '30000000-0000-4000-8000-000000000001'
  returning id
)
select is(
  (select count(*)::integer from changed),
  0,
  'client cannot update their client record'
);
reset role;

select ok(not has_table_privilege('anon', 'public.client_records', 'SELECT'), 'anonymous role cannot read client records');
select ok(not has_function_privilege('anon', 'public.is_workspace_owner(uuid)', 'EXECUTE'), 'anonymous role cannot execute the workspace helper');

select * from finish();
rollback;
