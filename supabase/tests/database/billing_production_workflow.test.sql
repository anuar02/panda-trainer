begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,aud,role,email) values
 ('bf340000-0000-4000-8000-000000000001','authenticated','authenticated','billing-workflow-owner@example.test'),
 ('bf340000-0000-4000-8000-000000000002','authenticated','authenticated','billing-workflow-client@example.test'),
 ('bf340000-0000-4000-8000-000000000003','authenticated','authenticated','billing-workflow-foreign@example.test');
insert into public.trainer_workspaces(id,owner_user_id,name) values
 ('bf340000-0000-4000-8000-000000000010','bf340000-0000-4000-8000-000000000001','Billing workflow'),
 ('bf340000-0000-4000-8000-000000000011','bf340000-0000-4000-8000-000000000003','Foreign workflow');
insert into public.client_records(id,workspace_id,user_id,display_name) values
 ('bf340000-0000-4000-8000-000000000020','bf340000-0000-4000-8000-000000000010','bf340000-0000-4000-8000-000000000002','Client'),
 ('bf340000-0000-4000-8000-000000000021','bf340000-0000-4000-8000-000000000010',null,'Peer'),
 ('bf340000-0000-4000-8000-000000000022','bf340000-0000-4000-8000-000000000011',null,'Foreign');
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values
 ('bf340000-0000-4000-8000-000000000030','bf340000-0000-4000-8000-000000000010','bf340000-0000-4000-8000-000000000020','2026-10-04 12:00:00Z','2026-10-04 13:00:00Z','confirmed');
create temporary table workflow_results(name text primary key,result jsonb);
grant all on workflow_results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"bf340000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into workflow_results values
 ('purchase',public.create_client_purchase('bf340000-0000-4000-8000-000000000020','Same title',8,10000,'bf340000-0000-4000-8000-000000000100')),
 ('expired',public.create_client_purchase('bf340000-0000-4000-8000-000000000020','Same title',4,20000,'bf340000-0000-4000-8000-000000000101','2020-01-01')),
 ('peer',public.create_client_purchase('bf340000-0000-4000-8000-000000000021','Same title',3,30000,'bf340000-0000-4000-8000-000000000102'));
select is(public.create_client_purchase('bf340000-0000-4000-8000-000000000020','Same title',8,10000,'bf340000-0000-4000-8000-000000000100'),(select result || '{"replayed":true}'::jsonb from workflow_results where name='purchase'),'creation replays exact purchase and grant');
reset role;
create temporary table workflow_before as select
 (select jsonb_agg(to_jsonb(t) order by id) from public.client_purchases t where workspace_id='bf340000-0000-4000-8000-000000000010') purchases,
 (select jsonb_agg(to_jsonb(t) order by id) from public.credit_entries t where workspace_id='bf340000-0000-4000-8000-000000000010') credits,
 (select jsonb_agg(to_jsonb(t) order by id) from public.bookings t where workspace_id='bf340000-0000-4000-8000-000000000010') bookings;
select is((select count(*)::integer from public.credit_entries where workspace_id='bf340000-0000-4000-8000-000000000010'),3,'each distinct same-title purchase grants once');
set local role authenticated;
insert into workflow_results values ('partial',public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='purchase'),4000,'2026-10-04','Kaspi','bf340000-0000-4000-8000-000000000103'));
select is((select result->>'due_minor' from workflow_results where name='partial'),'6000','partial payment leaves exact debt');
select throws_ok($$select public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='purchase'),6001,'2026-10-04','Kaspi','bf340000-0000-4000-8000-000000000104')$$,'P0003','Payment exceeds remaining debt','current debt is capped');
insert into workflow_results values ('full',public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='purchase'),6000,'2026-10-04','Наличные','bf340000-0000-4000-8000-000000000104'));
select is((select result->>'due_minor' from workflow_results where name='full'),'0','full payment settles exact purchase');
select is((select result->>'source' from workflow_results where name='full'),'manual','manual source preserved');
select is((select result->>'paid_on' from workflow_results where name='full'),'2026-10-04','payment date preserved');
select is((select result->>'currency' from workflow_results where name='full'),'KZT','currency preserved');
insert into workflow_results values ('reversal',public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from workflow_results where name='full'),' Mistake ','bf340000-0000-4000-8000-000000000105'));
select is((select result->>'due_minor' from workflow_results where name='reversal'),'6000','explicit reversal restores debt');
select is((select result->>'amount_minor' from workflow_results where name='reversal'),'-6000','full exact compensating entry');
select is((select result->>'reason' from workflow_results where name='reversal'),'Mistake','public reason canonical');
select is(public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from workflow_results where name='full'),'Mistake','bf340000-0000-4000-8000-000000000105'),(select result || '{"replayed":true}'::jsonb from workflow_results where name='reversal'),'reversal receipt replay after reload');
select is(public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='purchase'),6000,'2026-10-04','Наличные','bf340000-0000-4000-8000-000000000104'),(select result || '{"replayed":true}'::jsonb from workflow_results where name='full'),'original receipt stays stable after reversal');
insert into workflow_results values ('expiredPayment',public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='expired'),1000,'2026-10-04','Перевод','bf340000-0000-4000-8000-000000000106'));
select is((select result->>'due_minor' from workflow_results where name='expiredPayment'),'19000','expired debt remains payable');
reset role;
select is((select count(*)::integer from public.payment_entries where workspace_id='bf340000-0000-4000-8000-000000000010'),4,'replays and rejected overpayment append nothing');
select is((select count(*)::integer from public.payment_entries where client_record_id='bf340000-0000-4000-8000-000000000021'),0,'same title peer stays isolated');
select is((select sum(p.price_minor-(select coalesce(sum(e.amount_minor),0) from public.payment_entries e where e.purchase_id=p.id)) from public.client_purchases p where client_record_id='bf340000-0000-4000-8000-000000000020'),25000::numeric,'reload debt includes expired purchase');
select is((select sum(e.units) from public.credit_entries e join public.client_purchases p on p.id=e.purchase_id where p.client_record_id='bf340000-0000-4000-8000-000000000020' and (p.expires_on is null or p.expires_on>='2026-10-04')),8::bigint,'header session balance excludes expired purchase');
select ok((select bool_and(created_by='bf340000-0000-4000-8000-000000000001' and created_at is not null) from public.payment_entries where workspace_id='bf340000-0000-4000-8000-000000000010'),'server records author and creation date');
select is((select jsonb_agg(to_jsonb(t) order by id) from public.client_purchases t where workspace_id='bf340000-0000-4000-8000-000000000010'),(select purchases from workflow_before),'payments preserve immutable purchase terms');
select is((select jsonb_agg(to_jsonb(t) order by id) from public.credit_entries t where workspace_id='bf340000-0000-4000-8000-000000000010'),(select credits from workflow_before),'payments and reversals never mutate credit ledger');
select is((select jsonb_agg(to_jsonb(t) order by id) from public.bookings t where workspace_id='bf340000-0000-4000-8000-000000000010'),(select bookings from workflow_before),'debt never mutates booking or access');

create function pg_temp.fail_workflow_receipt() returns trigger language plpgsql as $$
begin
 if new.request_id='bf340000-0000-4000-8000-000000000107' then
  raise exception 'Workflow forced receipt failure' using errcode='P0001';
 end if;
 return new;
end; $$;
create trigger workflow_receipt_failure before insert on private.billing_command_receipts for each row execute function pg_temp.fail_workflow_receipt();
set local role authenticated;
select throws_ok($$select public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='purchase'),1000,'2026-10-04','Kaspi','bf340000-0000-4000-8000-000000000107')$$,'P0001','Workflow forced receipt failure','receipt failure rolls back financial command');
reset role;
select is((select count(*)::integer from public.payment_entries where workspace_id='bf340000-0000-4000-8000-000000000010'),4,'receipt failure leaves no payment');
select is((select count(*)::integer from private.billing_command_receipts where request_id='bf340000-0000-4000-8000-000000000107'),0,'receipt failure leaves no consumed request');
drop trigger workflow_receipt_failure on private.billing_command_receipts;
set local role authenticated;
select lives_ok($$select public.record_client_payment((select (result->>'purchase_id')::uuid from workflow_results where name='purchase'),1000,'2026-10-04','Kaspi','bf340000-0000-4000-8000-000000000107')$$,'same request safely continues after rolled back failure');
select set_config('request.jwt.claims','{"sub":"bf340000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(id)::integer from public.payment_entries),5,'linked client reload sees own immutable financial history');
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from workflow_results where name='partial'),'Unauthorized','bf340000-0000-4000-8000-000000000108')$$,'42501',null,'linked client cannot reverse');
select set_config('request.jwt.claims','{"sub":"bf340000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(id)::integer from public.payment_entries),0,'foreign owner cannot read workflow payments');
select throws_ok($$select public.reverse_client_payment((select (result->>'payment_entry_id')::uuid from workflow_results where name='partial'),'Foreign','bf340000-0000-4000-8000-000000000108')$$,'P0002',null,'foreign owner cannot reverse');
reset role;
select * from finish();
rollback;
