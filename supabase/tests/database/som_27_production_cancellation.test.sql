begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email) values
 ('e2700000-0000-4000-8000-000000000001','authenticated','authenticated','som27-owner@example.test'),
 ('e2700000-0000-4000-8000-000000000002','authenticated','authenticated','som27-client@example.test'),
 ('e2700000-0000-4000-8000-000000000003','authenticated','authenticated','som27-foreign@example.test');
insert into public.trainer_workspaces(id,owner_user_id,name,timezone) values
 ('e2700000-0000-4000-8000-000000000010','e2700000-0000-4000-8000-000000000001','Synthetic SOM-27','UTC'),
 ('e2700000-0000-4000-8000-000000000011','e2700000-0000-4000-8000-000000000003','Synthetic foreign','UTC');
insert into public.client_records(id,workspace_id,user_id,display_name) values
 ('e2700000-0000-4000-8000-000000000020','e2700000-0000-4000-8000-000000000010','e2700000-0000-4000-8000-000000000002','Synthetic client');
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status)
select id,'e2700000-0000-4000-8000-000000000010','e2700000-0000-4000-8000-000000000020',
 ((current_date+10)::timestamp+interval '10 hours') at time zone 'UTC',
 ((current_date+10)::timestamp+interval '11 hours') at time zone 'UTC','confirmed'
from unnest(array['e2700000-0000-4000-8000-000000000030'::uuid,'e2700000-0000-4000-8000-000000000031'::uuid,'e2700000-0000-4000-8000-000000000032'::uuid]) id;
select set_config('request.jwt.claims','{"sub":"e2700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.som27_purchase',public.create_client_purchase('e2700000-0000-4000-8000-000000000020','Synthetic units',2,1000,'e2700000-0000-4000-8000-000000000100')::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"e2700000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is(public.cancel_booking('e2700000-0000-4000-8000-000000000030',1,'e2700000-0000-4000-8000-000000000101')->>'status','cancelled_by_client','client cancels own confirmed booking');
select is((select count(*)::integer from public.credit_entries where workspace_id='e2700000-0000-4000-8000-000000000010' and kind='charge_late_cancel'),0,'client cancellation never automatically debits');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'Synthetic reason',gen_random_uuid())$$,'42501',null,'client cannot issue trainer debit');
reset role;
select set_config('request.jwt.claims','{"sub":"e2700000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(public.cancel_booking('e2700000-0000-4000-8000-000000000031',1,'e2700000-0000-4000-8000-000000000102')->>'status','cancelled_by_trainer','trainer cancels one booking');
select is((select count(*)::integer from public.credit_entries where workspace_id='e2700000-0000-4000-8000-000000000010' and kind='charge_late_cancel'),0,'trainer cancellation never automatically debits');
select is((select status from public.bookings where id='e2700000-0000-4000-8000-000000000032'),'confirmed','another booking remains confirmed');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'   ',gen_random_uuid())$$,'22023',null,'late client cancellation requires explicit reason');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000031',2,'',gen_random_uuid())$$,'22023',null,'late trainer cancellation requires explicit reason');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',1,'Synthetic reason',gen_random_uuid())$$,'40001',null,'debit must use cancelled booking revision');
select set_config('test.som27_client_debit',public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'Synthetic client cancellation reason','e2700000-0000-4000-8000-000000000103',(current_setting('test.som27_purchase')::jsonb->>'purchase_id')::uuid)::text,true);
select set_config('test.som27_trainer_debit',public.charge_late_cancellation('e2700000-0000-4000-8000-000000000031',2,'Synthetic trainer cancellation reason','e2700000-0000-4000-8000-000000000104',(current_setting('test.som27_purchase')::jsonb->>'purchase_id')::uuid)::text,true);
select is(current_setting('test.som27_client_debit')::jsonb->>'charged','true','explicit debit for client cancellation succeeds');
select is(current_setting('test.som27_trainer_debit')::jsonb->>'charged','true','explicit debit for trainer cancellation succeeds');
select is((select count(*)::integer from public.attendance_records where workspace_id='e2700000-0000-4000-8000-000000000010'),0,'cancellation debit creates no attendance');
select is((select sum(units)::integer from public.credit_entries where purchase_id=(current_setting('test.som27_purchase')::jsonb->>'purchase_id')::uuid),0,'two explicit debits consume exactly two units');
select is((select reason from public.credit_entries where booking_id='e2700000-0000-4000-8000-000000000030'),'Synthetic client cancellation reason','client cancellation debit preserves public reason');
select is((public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'Synthetic client cancellation reason','e2700000-0000-4000-8000-000000000103',(current_setting('test.som27_purchase')::jsonb->>'purchase_id')::uuid)-'replayed'),current_setting('test.som27_client_debit')::jsonb-'replayed','lost response replays original exact receipt');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'Changed reason','e2700000-0000-4000-8000-000000000103',(current_setting('test.som27_purchase')::jsonb->>'purchase_id')::uuid)$$,'22023',null,'same request cannot replace reason');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'Duplicate',gen_random_uuid())$$,'55000',null,'new request cannot debit cancellation twice');
select is((select revision from public.bookings where id='e2700000-0000-4000-8000-000000000030'),2,'debit leaves cancelled booking revision unchanged');
reset role;
select set_config('request.jwt.claims','{"sub":"e2700000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.cancel_booking('e2700000-0000-4000-8000-000000000032',1,gen_random_uuid())$$,'P0002',null,'foreign workspace cannot cancel known booking');
select throws_ok($$select public.charge_late_cancellation('e2700000-0000-4000-8000-000000000030',2,'Foreign',gen_random_uuid())$$,'P0002',null,'foreign workspace cannot debit known booking');
reset role;
select * from finish();
rollback;
