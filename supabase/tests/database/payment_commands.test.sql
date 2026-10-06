begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email) values
 ('bd000000-0000-4000-8000-000000000001','authenticated','authenticated','pay-owner@example.test'),
 ('bd000000-0000-4000-8000-000000000002','authenticated','authenticated','pay-client@example.test'),
 ('bd000000-0000-4000-8000-000000000003','authenticated','authenticated','pay-foreign@example.test');
insert into public.trainer_workspaces(id,owner_user_id,name) values
 ('bd000000-0000-4000-8000-000000000010','bd000000-0000-4000-8000-000000000001','Payments');
insert into public.trainer_workspaces(id,owner_user_id,name) values ('bd000000-0000-4000-8000-000000000011','bd000000-0000-4000-8000-000000000003','Foreign');
insert into public.client_records(id,workspace_id,user_id,display_name) values
 ('bd000000-0000-4000-8000-000000000020','bd000000-0000-4000-8000-000000000010','bd000000-0000-4000-8000-000000000002','Client'),
 ('bd000000-0000-4000-8000-000000000021','bd000000-0000-4000-8000-000000000011',null,'Foreign');
insert into public.client_purchases(id,workspace_id,client_record_id,title,units,price_minor,created_by) values
 ('bd000000-0000-4000-8000-000000000030','bd000000-0000-4000-8000-000000000010','bd000000-0000-4000-8000-000000000020','Package',10,10000,'bd000000-0000-4000-8000-000000000001'),
 ('bd000000-0000-4000-8000-000000000031','bd000000-0000-4000-8000-000000000010','bd000000-0000-4000-8000-000000000020','Large',10,9223372036854775807,'bd000000-0000-4000-8000-000000000001'),
 ('bd000000-0000-4000-8000-000000000032','bd000000-0000-4000-8000-000000000011','bd000000-0000-4000-8000-000000000021','Foreign',10,10000,'bd000000-0000-4000-8000-000000000003'),
 ('bd000000-0000-4000-8000-000000000033','bd000000-0000-4000-8000-000000000010','bd000000-0000-4000-8000-000000000020','Free',10,0,'bd000000-0000-4000-8000-000000000001');
create temporary table payment_results(name text primary key,result jsonb);
grant all on payment_results to authenticated;
select ok(not has_function_privilege('anon','public.record_client_payment(uuid,bigint,date,text,uuid,text)','EXECUTE'),'anonymous RPC denied');
select ok(not has_function_privilege('authenticated','private.apply_payment_command(text,uuid,uuid,bigint,date,text,text,uuid)','EXECUTE'),'helper private');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bd000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',100,'2026-10-03','Kaspi',gen_random_uuid())$$,'42501',null,'linked client cannot record');
select set_config('request.jwt.claims','{"sub":"bd000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000032',100,'2026-10-03','Kaspi',gen_random_uuid())$$,'P0002',null,'foreign purchase unavailable');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',0,'2026-10-03','Kaspi',gen_random_uuid())$$,'22023',null,'zero rejected');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',-1,'2026-10-03','Kaspi',gen_random_uuid())$$,'22023',null,'negative rejected');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',100,'infinity','Kaspi',gen_random_uuid())$$,'22023',null,'infinite date rejected');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',100,'2026-10-03','Card',gen_random_uuid())$$,'22023',null,'unknown method rejected');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000033',1,'2026-10-03','Kaspi',gen_random_uuid())$$,'P0003','Payment exceeds remaining debt','free purchase has no debt');
insert into payment_results values('first',public.record_client_payment('bd000000-0000-4000-8000-000000000030',4000,'2026-10-03',' Kaspi ','bd000000-0000-4000-8000-000000000040',' Deposit '));
select is((select result->>'paid_minor' from payment_results where name='first'),'4000','paid is lossless text');
select is((select result->>'due_minor' from payment_results where name='first'),'6000','exact remaining debt');
select is((select result->>'reason' from payment_results where name='first'),'Deposit','reason canonical');
select is(public.record_client_payment('bd000000-0000-4000-8000-000000000030',4000,'2026-10-03','Kaspi','bd000000-0000-4000-8000-000000000040','Deposit'),(select result || '{"replayed":true}'::jsonb from payment_results where name='first'),'canonical retry returns receipt');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',4001,'2026-10-03','Kaspi','bd000000-0000-4000-8000-000000000040','Deposit')$$,'22023',null,'changed payload rejected');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',6001,'2026-10-03','Kaspi','bd000000-0000-4000-8000-000000000041')$$,'P0003','Payment exceeds remaining debt','overpayment definitive');
insert into payment_results values('full',public.record_client_payment('bd000000-0000-4000-8000-000000000030',6000,'2026-10-03','Наличные','bd000000-0000-4000-8000-000000000041'));
select is((select result->>'due_minor' from payment_results where name='full'),'0','failure did not consume request id');
select throws_ok($$select public.record_client_payment('bd000000-0000-4000-8000-000000000030',1,'2026-10-03','Kaspi',gen_random_uuid())$$,'P0003',null,'settled purchase rejects further payment');
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='first'),' ',gen_random_uuid())$$,'22023',null,'reversal needs reason');
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='first'),'Correction','bd000000-0000-4000-8000-000000000040')$$,'22023',null,'cross command receipt collision rejected');
insert into payment_results values('reversal',public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='first'),' Correction ','bd000000-0000-4000-8000-000000000042'));
select is((select result->>'amount_minor' from payment_results where name='reversal'),'-4000','full exact reversal');
select is((select result->>'due_minor' from payment_results where name='reversal'),'4000','reversal restores debt');
select is((select result->>'method' from payment_results where name='reversal'),'Kaspi','original method retained');
select is(public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='first'),'Correction','bd000000-0000-4000-8000-000000000042'),(select result || '{"replayed":true}'::jsonb from payment_results where name='reversal'),'reversal retry idempotent');
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='first'),'Again',gen_random_uuid())$$,'55000',null,'second reversal rejected');
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='reversal'),'Again',gen_random_uuid())$$,'55000',null,'reversal cannot be reversed');
select is(public.record_client_payment('bd000000-0000-4000-8000-000000000030',4000,'2026-10-03','Kaspi','bd000000-0000-4000-8000-000000000040','Deposit'),(select result || '{"replayed":true}'::jsonb from payment_results where name='first'),'original receipt stable after reversal');
insert into payment_results values('large',public.record_client_payment('bd000000-0000-4000-8000-000000000031',9223372036854775807,'2026-10-03','Перевод',gen_random_uuid()));
select is((select result->>'amount_minor' from payment_results where name='large'),'9223372036854775807','maximum bigint remains exact');
select is((select result->>'due_minor' from payment_results where name='large'),'0','maximum bigint settlement exact');
select lives_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='large'),'Large correction',gen_random_uuid())$$,'maximum bigint reverses safely');
select throws_ok($$select * from private.billing_command_receipts$$,'42501',null,'receipts unreadable');
select set_config('request.jwt.claims','{"sub":"bd000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='full'),'Foreign correction',gen_random_uuid())$$,'P0002',null,'foreign owner cannot reverse');
select set_config('request.jwt.claims','{"sub":"bd000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select set_config('request.jwt.claims','{"sub":"bd000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from payment_results where name='full'),'Client correction',gen_random_uuid())$$,'42501',null,'client cannot reverse');
reset role;
select is((select count(*)::integer from public.payment_entries where workspace_id='bd000000-0000-4000-8000-000000000010'),5,'failures and retries append nothing');
select is((select count(*)::integer from public.credit_entries where workspace_id='bd000000-0000-4000-8000-000000000010'),0,'payments never change session credits');
select is((select units from public.client_purchases where id='bd000000-0000-4000-8000-000000000030'),10,'payments never change units');
select is((select count(*)::integer from private.billing_command_receipts where workspace_id='bd000000-0000-4000-8000-000000000010'),5,'one receipt per successful command');
select throws_ok($$update private.billing_command_receipts set result='{}' where workspace_id='bd000000-0000-4000-8000-000000000010'$$,'55000',null,'receipts immutable');
select * from finish();
rollback;
