begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(25);

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

insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at)
values
('42000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',now()+interval '1 day',now()+interval '1 day 1 hour'),
('42000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001',now()+interval '2 days',now()+interval '2 days 1 hour'),
('42000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '1 day 1 hour'),
('42000000-0000-4000-8000-000000000004','22000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000005',now()+interval '1 day',now()+interval '1 day 1 hour');
insert into public.schedule_proposals(id,workspace_id,booking_id,author_user_id,proposed_starts_at,proposed_ends_at,base_revision,status)
values
('52000000-0000-4000-8000-000000000001','22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003',now()+interval '3 days',now()+interval '3 days 1 hour',1,'pending'),
('52000000-0000-4000-8000-000000000002','22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000001',now()+interval '3 days',now()+interval '3 days 1 hour',1,'pending'),
('52000000-0000-4000-8000-000000000003','22000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000004',now()+interval '3 days',now()+interval '3 days 1 hour',1,'pending'),
('52000000-0000-4000-8000-000000000004','22000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000004','12000000-0000-4000-8000-000000000002',now()+interval '3 days',now()+interval '3 days 1 hour',1,'pending'),
('52000000-0000-4000-8000-000000000005','22000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003',now()+interval '4 days',now()+interval '4 days 1 hour',1,'declined');
select is(pg_get_function_result('public.get_my_client_schedule_proposals(uuid,integer,integer)'::regprocedure),'TABLE(id uuid, workspace_id uuid, booking_id uuid, proposed_starts_at timestamp with time zone, proposed_ends_at timestamp with time zone, base_revision integer, status text, revision integer, created_at timestamp with time zone, updated_at timestamp with time zone, author_role text)','proposal result exposes approved columns only');
select ok(not has_function_privilege('anon','public.get_my_client_schedule_context(uuid)','EXECUTE'),'anon context execute denied');
select ok(not has_function_privilege('anon','public.get_my_client_schedule_proposals(uuid,integer,integer)','EXECUTE'),'anon proposal execute denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000001'),jsonb_build_object('client_record_id','32000000-0000-4000-8000-000000000001','workspace_id','22000000-0000-4000-8000-000000000001','client_name','Client A in Studio A','trainer_name','Studio A','timezone','Asia/Almaty'),'context redacts owner auth UUID and settings');
select is(public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000002')->>'trainer_name','Studio B','same account reads separate second-trainer connection');
select is((select count(*)::integer from public.trainer_workspaces),0,'new RPCs do not grant workspace table access');
select is((select count(*)::integer from public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001')),2,'only own pending proposals from requested card');
select is((select author_role from public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001') where id='52000000-0000-4000-8000-000000000001'),'trainer','trainer author is redacted role');
select is((select author_role from public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001') where id='52000000-0000-4000-8000-000000000002'),'client','client author is redacted role');
select is((select id::text from public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001',1,1)),'52000000-0000-4000-8000-000000000002','stable ID pagination returns second row');
select is((select count(*)::integer from public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000002')),1,'second workspace request excludes first workspace and peer card');
select throws_ok($$select public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000003')$$,'P0002',null,'archived linked card unavailable');
select throws_ok($$select public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000003')$$,'P0002',null,'archived proposal scope unavailable');
select throws_ok($$select public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000004')$$,'P0002',null,'unlinked card unavailable');
select throws_ok($$select public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000005')$$,'P0002',null,'peer card proposals unavailable');
select throws_ok($$select public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001',0,501)$$,'22023',null,'page cap enforced');
select throws_ok($$select public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001',-1,1)$$,'22023',null,'negative offset invalid');
select throws_ok($$select public.get_my_client_schedule_context(null)$$,'22023',null,'null context scope invalid');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000005')),1,'second client reads own proposals');
select throws_ok($$select public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000001')$$,'P0002',null,'second client cannot read first context');
select set_config('request.jwt.claims','{"sub":"12000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000001')$$,'P0002',null,'owner does not implicitly become client');
select is((select count(*)::integer from public.schedule_proposals where workspace_id='22000000-0000-4000-8000-000000000001'),3,'owner existing table proposal access unchanged');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000001')$$,'42501',null,'missing identity cannot read context');
select throws_ok($$select public.get_my_client_schedule_proposals('32000000-0000-4000-8000-000000000001')$$,'42501',null,'missing identity cannot read proposals');
reset role;
set local role anon;
select throws_ok($$select public.get_my_client_schedule_context('32000000-0000-4000-8000-000000000001')$$,'42501',null,'anon call blocked');
reset role;
select * from finish();
rollback;
