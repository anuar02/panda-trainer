begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id,aud,role,email) values
 ('f0360000-0000-4000-8000-000000000001','authenticated','authenticated','som36-owner@example.test'),
 ('f0360000-0000-4000-8000-000000000002','authenticated','authenticated','som36-client@example.test'),
 ('f0360000-0000-4000-8000-000000000003','authenticated','authenticated','som36-foreign@example.test');
insert into public.trainer_workspaces(id,owner_user_id,name) values
 ('f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000001','Own studio'),
 ('f0360000-0000-4000-8000-000000000011','f0360000-0000-4000-8000-000000000003','Foreign studio');
insert into public.client_records(id,workspace_id,user_id,display_name,archived_at) values
 ('f0360000-0000-4000-8000-000000000020','f0360000-0000-4000-8000-000000000010',null,'Existing client',null),
 ('f0360000-0000-4000-8000-000000000021','f0360000-0000-4000-8000-000000000011','f0360000-0000-4000-8000-000000000002','Second trainer',null),
 ('f0360000-0000-4000-8000-000000000022','f0360000-0000-4000-8000-000000000011','f0360000-0000-4000-8000-000000000003','Foreign client',null),
 ('f0360000-0000-4000-8000-000000000023','f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000002','Archived client',now());
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status)
select ('f0360000-0000-4000-8000-' || lpad((30+i)::text,12,'0'))::uuid,'f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000020',
 '2020-01-01 10:00Z'::timestamptz+i*interval '1 day','2020-01-01 11:00Z'::timestamptz+i*interval '1 day','confirmed'
from generate_series(0,2) i;
insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,started_at,finished_at) values
 ('f0360000-0000-4000-8000-000000000040','f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000030','f0360000-0000-4000-8000-000000000020','2020-01-01T10:00Z','2020-01-01T11:00Z'),
 ('f0360000-0000-4000-8000-000000000041','f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000031','f0360000-0000-4000-8000-000000000020','2020-01-02T10:00Z',null);
insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id) values
 ('f0360000-0000-4000-8000-000000000050','f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000040','Shared finished','f0360000-0000-4000-8000-000000000001','f0360000-0000-4000-8000-000000000090'),
 ('f0360000-0000-4000-8000-000000000051','f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000041','Draft shared','f0360000-0000-4000-8000-000000000001','f0360000-0000-4000-8000-000000000090');
insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id) values
 ('f0360000-0000-4000-8000-000000000052','f0360000-0000-4000-8000-000000000010','f0360000-0000-4000-8000-000000000040','Private finished','f0360000-0000-4000-8000-000000000001','f0360000-0000-4000-8000-000000000090');
insert into public.attendance_records(workspace_id,client_record_id,booking_id,service_date,status)
select workspace_id,client_record_id,id,starts_at::date,case when id='f0360000-0000-4000-8000-000000000030'::uuid then 'present' when id='f0360000-0000-4000-8000-000000000031'::uuid then 'noshow' else 'undone' end from public.bookings where workspace_id='f0360000-0000-4000-8000-000000000010';
create temporary table results(name text primary key, result jsonb);
grant all on results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f0360000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results values
 ('active',public.create_client_purchase('f0360000-0000-4000-8000-000000000020','Active',8,9007199254740993,'f0360000-0000-4000-8000-000000000100')),
 ('expired',public.create_client_purchase('f0360000-0000-4000-8000-000000000020','Expired',4,2000,'f0360000-0000-4000-8000-000000000101','2020-01-01'));
select lives_ok($$select public.issue_client_invitation('f0360000-0000-4000-8000-000000000020',(repeat('a',42)||'A'),'f0360000-0000-4000-8000-000000000102')$$,'owner invites existing history');
select set_config('request.jwt.claims','{"sub":"f0360000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2020-01-08')$$,'P0002',null,'unlinked totals denied');
select is((select count(id)::integer from public.workout_instances),0,'history hidden before linkage');
select lives_ok($$select public.accept_invitation((repeat('a',42)||'A'))$$,'client accepts invitation');
insert into results values ('overview',public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2020-01-08'));
select is((select result->>'remaining_units' from results where name='overview'),'8','only unexpired units');
select is((select result->>'active_units' from results where name='overview'),'8','active package capacity');
select is((select result->>'due_minor' from results where name='overview'),'9007199254742993','expired debt included with exact bigint text');
select is((select result->'visits' from results where name='overview'),'[{"date":"2020-01-01","count":"1"}]'::jsonb,'only present attendance, not journal count');
select is(public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-02','2020-01-03')->'visits','[]'::jsonb,'empty period has no invented attendance');
select is(public.get_my_client_overview('f0360000-0000-4000-8000-000000000021','2020-01-01','2020-01-08')->>'due_minor','0','second trainer card separate');
select is((select count(id)::integer from public.workout_instances),1,'only own finished history after invitation');
select is((select text from public.session_notes),'Shared finished','unfinished shared notes hidden');
select is((select count(id)::integer from public.private_notes),0,'private notes never readable by client');
select throws_ok($$select public.get_my_client_overview('f0360000-0000-4000-8000-000000000022','2020-01-01','2020-01-08')$$,'P0002',null,'foreign tenant denied');
select throws_ok($$select public.get_my_client_overview('f0360000-0000-4000-8000-000000000023','2020-01-01','2020-01-08')$$,'P0002',null,'archived card denied');
select throws_ok($$select public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2022-01-01')$$,'22023',null,'bounded attendance period');
select throws_ok($$select public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2020-01-01')$$,'22023',null,'invalid range denied');
select ok(not exists(select 1 from jsonb_object_keys((select result from results where name='overview')) k where k not in ('context','today','starts_on','ends_on','remaining_units','active_units','due_minor','visits')),'RPC approved aggregate fields only');
select throws_ok($$select 1 from private.billing_command_receipts$$,'42501',null,'client cannot read private billing receipts');
select ok(not has_function_privilege('anon','public.get_my_client_overview(uuid,date,date)','EXECUTE'),'anon cannot execute');
select set_config('request.jwt.claims','{"sub":"f0360000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into results values ('payment',public.record_client_payment((select (result->>'purchase_id')::uuid from results where name='active'),101,'2026-10-04','Kaspi','f0360000-0000-4000-8000-000000000103'));
select set_config('request.jwt.claims','{"sub":"f0360000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2020-01-08')->>'due_minor','9007199254742892','refresh reflects exact payment');
select set_config('request.jwt.claims','{"sub":"f0360000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from results where name='payment'),'Mistake','f0360000-0000-4000-8000-000000000104')$$,'reversal remains explicit');
select set_config('request.jwt.claims','{"sub":"f0360000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2020-01-08'),(select result from results where name='overview'),'reversal readback and repeated read preserve state');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.get_my_client_overview('f0360000-0000-4000-8000-000000000020','2020-01-01','2020-01-08')$$,'42501',null,'missing identity denied');
reset role;
select * from finish();
rollback;
