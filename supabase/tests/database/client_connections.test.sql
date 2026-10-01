begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(18);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('12000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'connections-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('12000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'connections-client-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('12000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'connections-trainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('12000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'connections-trainer-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000003', 'Studio A'),
  ('22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000004', 'Studio B');

insert into public.client_records (id, workspace_id, user_id, display_name, archived_at)
values
  ('32000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Client A in Studio A', null),
  ('32000000-0000-4000-8000-000000000002', '22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001', 'Client A in Studio B', null),
  ('32000000-0000-4000-8000-000000000003', '22000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000001', 'Archived card', now()),
  ('32000000-0000-4000-8000-000000000004', '22000000-0000-4000-8000-000000000001', null, 'Unlinked card', null),
  ('32000000-0000-4000-8000-000000000005', '22000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000002', 'Client B card', null);

select is(
  pg_get_function_result('public.list_my_client_connections()'::regprocedure),
  'TABLE(client_record_id uuid, workspace_id uuid, trainer_name text, client_name text)',
  'RPC returns only the four approved connection fields'
);
select ok(has_function_privilege('authenticated', 'public.list_my_client_connections()', 'EXECUTE'), 'authenticated clients can list connections');
select ok(not has_function_privilege('anon', 'public.list_my_client_connections()', 'EXECUTE'), 'anonymous users cannot list connections');
select ok(not exists (select 1 from public.profiles where user_id = '12000000-0000-4000-8000-000000000001'), 'connection listing does not require a synthetic profile');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.list_my_client_connections()), 2, 'client receives active connections across both trainer workspaces');
select is((select count(distinct workspace_id)::integer from public.list_my_client_connections()), 2, 'client cards remain separate by workspace');
select is((select trainer_name || '|' || client_name from public.list_my_client_connections() where client_record_id = '32000000-0000-4000-8000-000000000001'), 'Studio A|Client A in Studio A', 'connection exposes the matching trainer and client display names');
select is((select trainer_name || '|' || client_name from public.list_my_client_connections() where client_record_id = '32000000-0000-4000-8000-000000000002'), 'Studio B|Client A in Studio B', 'second trainer connection returns its own card and name');
select ok(not exists (select 1 from public.list_my_client_connections() where client_record_id = '32000000-0000-4000-8000-000000000003'), 'archived cards are omitted');
select ok(not exists (select 1 from public.list_my_client_connections() where client_record_id = '32000000-0000-4000-8000-000000000004'), 'unlinked cards are omitted');
select ok(not exists (select 1 from public.list_my_client_connections() where client_record_id = '32000000-0000-4000-8000-000000000005'), 'another account’s card is omitted');
select is((select count(*)::integer from public.client_records), 3, 'existing direct client RLS continues to expose only this account’s linked cards');
select ok(not exists (select 1 from public.client_records where id = '32000000-0000-4000-8000-000000000004'), 'direct client RLS still hides unlinked cards');

select set_config('request.jwt.claims', '{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.client_records where workspace_id = '22000000-0000-4000-8000-000000000001'), 3, 'trainer direct RLS still returns only records in their own workspace');
select is((select count(*)::integer from public.client_records where id = '32000000-0000-4000-8000-000000000002'), 0, 'trainer direct RLS keeps another workspace private');
select is((select count(*)::integer from public.list_my_client_connections()), 0, 'trainer identity does not list records as client connections');

select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
select throws_ok($$select public.list_my_client_connections()$$, '42501', null, 'authenticated call without a user identity is rejected');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.list_my_client_connections()$$, '42501', null, 'anonymous call is denied');

select * from finish();
rollback;
