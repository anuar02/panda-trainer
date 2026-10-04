begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(14);

insert into auth.users (id, aud, role, email)
values
  ('53000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'onboarding-return-client@example.test'),
  ('53000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'onboarding-return-trainer-a@example.test'),
  ('53000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'onboarding-return-trainer-b@example.test');
insert into public.profiles (user_id, display_name)
values ('53000000-0000-4000-8000-000000000001', 'Existing client identity');
insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'Existing trainer A'),
  ('63000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000003', 'Existing trainer B');
insert into public.client_records (id, workspace_id, user_id, display_name, archived_at)
values
  ('73000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', 'Existing card A', null),
  ('73000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000003', '53000000-0000-4000-8000-000000000001', 'Existing card B', null),
  ('73000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', 'Archived history', now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.list_my_client_connections()), 2, 'returning client has two active trainer scopes');
select is((select count(*)::integer from public.client_records where user_id = auth.uid() and archived_at is null), 2, 'direct actor/active read matches RPC count before onboarding');
select ok(has_column_privilege('authenticated', 'public.client_records', 'created_by', 'SELECT'), 'onboarding connection audit columns can be selected');
select is((select count(*)::integer from public.trainer_workspaces where owner_user_id = auth.uid()), 0, 'returning client has no owned trainer workspace');
select lives_ok($$select public.complete_trainer_onboarding('New trainer input', 'Own new studio', array['strength'], array[0,1], '07:00', '21:00', 60, 'Optional first card', null)$$, 'explicit trainer completion can coexist with client scopes');
select is((select display_name from public.profiles where user_id = auth.uid()), 'Existing client identity', 'trainer completion preserves existing profile');
select is((select count(*)::integer from public.list_my_client_connections()), 2, 'trainer completion preserves both active connections');
select is((select count(*)::integer from public.client_records where user_id = auth.uid()), 3, 'archived history remains linked after trainer completion');
select is((select count(*)::integer from public.exercises where workspace_id = (select id from public.trainer_workspaces where owner_user_id = auth.uid())), 81, 'new own workspace has exactly one starter catalog');
select lives_ok($$select public.complete_trainer_onboarding('Changed input', 'Changed studio', array['yoga'], array[6], '08:00', '18:00', 45, 'Different first card', '123')$$, 'lost response replay with different inputs is safe');
select is((select count(*)::integer from public.client_records where workspace_id = (select id from public.trainer_workspaces where owner_user_id = auth.uid())), 1, 'replay never duplicates the optional first client');
select is((select display_name from public.client_records where workspace_id = (select id from public.trainer_workspaces where owner_user_id = auth.uid())), 'Optional first card', 'replay preserves original first card');
select is((select count(*)::integer from public.client_records c join public.list_my_client_connections() l on l.client_record_id = c.id and l.workspace_id = c.workspace_id and l.client_name = c.display_name where c.user_id = auth.uid() and c.archived_at is null), 2, 'actor/card/workspace/name links still match the connection projection after replay');
select is((select count(*)::integer from public.client_records where user_id = auth.uid() and revision = 1), 3, 'onboarding and replay do not revise existing client history');

select * from finish();
rollback;
