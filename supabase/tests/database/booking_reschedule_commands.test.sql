begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(38);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('57000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'program-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('57000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'program-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('57000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'program-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('57000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'program-client-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('57000000-0000-4000-8000-000000000001', 'Program trainer A'),
  ('57000000-0000-4000-8000-000000000002', 'Program trainer B'),
  ('57000000-0000-4000-8000-000000000003', 'Program client A'),
  ('57000000-0000-4000-8000-000000000004', 'Program client B');

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'Program workspace A'),
  ('67000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000002', 'Program workspace B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('77000000-0000-4000-8000-000000000001', '67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000003', 'Program client A'),
  ('77000000-0000-4000-8000-000000000002', '67000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000004', 'Program client B'),
  ('77000000-0000-4000-8000-000000000003', '67000000-0000-4000-8000-000000000002', null, 'Foreign program client');

insert into public.workout_templates (id, workspace_id, name)
values ('87000000-0000-4000-8000-000000000099', '67000000-0000-4000-8000-000000000002', 'Foreign template');
insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps)
select '67000000-0000-4000-8000-000000000002', '87000000-0000-4000-8000-000000000099', e.id, 0, 3, '8'
from public.exercises e where e.workspace_id = '67000000-0000-4000-8000-000000000002' and e.source_key = 'e0';

insert into public.workout_templates (id,workspace_id,name) values ('87000000-0000-4000-8000-000000000098','67000000-0000-4000-8000-000000000001','Empty booking template');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.template_result', public.save_workout_template(null, null, 'Strength plan', 'Initial description',
  jsonb_build_array(
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '67000000-0000-4000-8000-000000000001' and source_key = 'e0'), 'planned_sets', 4, 'planned_reps', '8–12', 'planned_weight_g', 20000, 'rest_seconds', 60, 'note', 'Warm up'),
    jsonb_build_object('exercise_id', (select id from public.exercises where workspace_id = '67000000-0000-4000-8000-000000000001' and source_key = 'e69'), 'planned_sets', 2, 'planned_seconds', '30–45', 'rest_seconds', 90, 'note', 'Finish')
  ), '87000000-0000-4000-8000-000000000001')::text, true);
select set_config('test.template_id', current_setting('test.template_result')::jsonb->>'id', true);
select set_config('test.template_revision', current_setting('test.template_result')::jsonb->>'revision', true);

select set_config('test.start', ((current_date + 30)::timestamp at time zone 'Asia/Almaty' + interval '10 hours')::text, true);
select set_config('test.end', (current_setting('test.start')::timestamptz + interval '1 hour')::text, true);
select set_config('test.group', public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid], current_setting('test.start')::timestamptz, current_setting('test.end')::timestamptz, false, '87000000-0000-4000-8000-000000000020', current_setting('test.template_id')::uuid, current_setting('test.template_revision')::integer)::text,true);
select set_config('test.booking', current_setting('test.group')::jsonb->'booking_ids'->>0,true);
select set_config('test.target',(current_setting('test.start')::timestamptz+interval '1 day')::text,true);
select set_config('test.proposal',public.propose_booking_reschedule(current_setting('test.booking')::uuid,1,current_setting('test.target')::timestamptz,'87000000-0000-4000-8000-000000000050')::text,true);
select set_config('test.pid',current_setting('test.proposal')::jsonb->>'proposal_id',true);
select is((select starts_at::text from public.bookings where id=current_setting('test.booking')::uuid),current_setting('test.start'),'proposal preserves original occupied interval');
select is((current_setting('test.proposal')::jsonb->>'proposal_revision')::integer,1,'proposal starts revision one');
select is((current_setting('test.proposal')::jsonb->>'booking_revision')::integer,1,'proposal does not increment booking revision');
select throws_ok($$select public.accept_booking_reschedule(current_setting('test.pid')::uuid,1,1,gen_random_uuid())$$,'42501',null,'author cannot accept own proposal');
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,1,current_setting('test.target')::timestamptz,gen_random_uuid())$$,'55000',null,'one current pending proposal');
select is((public.propose_booking_reschedule(current_setting('test.booking')::uuid,1,current_setting('test.target')::timestamptz,'87000000-0000-4000-8000-000000000050')->>'replayed'),'true','propose retry replays');
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,1,current_setting('test.target')::timestamptz+interval '1 day','87000000-0000-4000-8000-000000000050')$$,'22023',null,'receipt binds target');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.counter',public.counter_booking_reschedule(current_setting('test.pid')::uuid,1,1,current_setting('test.target')::timestamptz+interval '1 day',gen_random_uuid())::text,true);
select is((current_setting('test.counter')::jsonb->>'proposal_revision')::integer,2,'counter advances proposal revision');
select throws_ok($$select public.accept_booking_reschedule(current_setting('test.pid')::uuid,2,1,gen_random_uuid())$$,'42501',null,'counter author cannot accept own target');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.accept_booking_reschedule(current_setting('test.pid')::uuid,1,1,gen_random_uuid())$$,'40001',null,'outdated proposal version rejected');
select set_config('test.accept',public.accept_booking_reschedule(current_setting('test.pid')::uuid,2,1,'87000000-0000-4000-8000-000000000051')::text,true);
select is((current_setting('test.accept')::jsonb->>'booking_revision')::integer,2,'accept advances booking revision once');
select is((select group_session_id from public.bookings where id=current_setting('test.booking')::uuid),null::uuid,'moving participant detaches group');
select is((select count(*)::integer from public.bookings where group_session_id=(current_setting('test.group')::jsonb->>'group_session_id')::uuid),1,'peer stays in original group');
select is((select count(*)::integer from public.booking_programs),2,'immutable programs retained');
select is((public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)->'booking_ids'),current_setting('test.group')::jsonb->'booking_ids','creation replay preserves original participant IDs after anchor detaches');

select is((select extract(epoch from ends_at-starts_at)::integer from public.bookings where id=current_setting('test.booking')::uuid),3600,'elapsed duration preserved');
select is((public.accept_booking_reschedule(current_setting('test.pid')::uuid,2,1,'87000000-0000-4000-8000-000000000051')->>'replayed'),'true','accept retry ignores subsequent state');
select set_config('test.new',public.propose_booking_reschedule(current_setting('test.booking')::uuid,2,current_setting('test.target')::timestamptz+interval '2 days',gen_random_uuid())::text,true);
select set_config('test.newpid',current_setting('test.new')::jsonb->>'proposal_id',true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.confirm',public.confirm_booking(current_setting('test.booking')::uuid,2,gen_random_uuid())::text,true);
select throws_ok($$select public.accept_booking_reschedule(current_setting('test.newpid')::uuid,1,3,gen_random_uuid())$$,'40001',null,'confirmation invalidates base revision without rebase');
select is((select status from public.schedule_proposals where id=current_setting('test.newpid')::uuid),'pending','failed stale reply cannot secretly update proposal');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.withdraw',public.withdraw_booking_reschedule(current_setting('test.newpid')::uuid,1,3,gen_random_uuid())::text,true);
select is((current_setting('test.withdraw')::jsonb->>'proposal_status'),'withdrawn','latest author can withdraw stale base at current booking revision');
select set_config('test.stale',public.propose_booking_reschedule(current_setting('test.booking')::uuid,3,current_setting('test.target')::timestamptz+interval '2 days',gen_random_uuid())::text,true);
reset role;
update public.bookings set starts_at=starts_at+interval '1 minute',ends_at=ends_at+interval '1 minute' where id=current_setting('test.booking')::uuid;
set local role authenticated;
select set_config('test.replacement',public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,current_setting('test.target')::timestamptz+interval '3 days',gen_random_uuid())::text,true);
select is((select status from public.schedule_proposals where id=(current_setting('test.stale')::jsonb->>'proposal_id')::uuid),'stale','fresh propose retires outdated pending request');
select is((select count(*)::integer from public.schedule_proposals where booking_id=current_setting('test.booking')::uuid and status='pending'),1,'stale replacement leaves one pending');
select throws_ok($$select public.withdraw_booking_reschedule((current_setting('test.replacement')::jsonb->>'proposal_id')::uuid,1,3,gen_random_uuid())$$,'40001',null,'withdraw requires current booking revision');
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,now()-interval '1 day',gen_random_uuid())$$,'55000',null,'live proposal prevents replacement even with invalid target');
select throws_ok($$delete from public.schedule_proposals$$,'42501',null,'direct proposal mutation denied');
select set_config('test.closed',public.withdraw_booking_reschedule((current_setting('test.replacement')::jsonb->>'proposal_id')::uuid,1,4,gen_random_uuid())::text,true);
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,now()-interval '1 day',gen_random_uuid())$$,'22023',null,'past target rejected');
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,(select starts_at from public.bookings where id=current_setting('test.booking')::uuid),gen_random_uuid())$$,'22023',null,'identical target rejected');
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,((current_date+40)::timestamp+interval '23 hours 30 minutes') at time zone 'Asia/Almaty',gen_random_uuid())$$,'22023',null,'duration crossing local midnight rejected');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.clientproposal',public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,((current_date+40)::timestamp+interval '23 hours') at time zone 'Asia/Almaty',gen_random_uuid())::text,true);
select is((current_setting('test.clientproposal')::jsonb->>'proposal_status'),'pending','client can propose exact-midnight ending');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.declined',public.decline_booking_reschedule((current_setting('test.clientproposal')::jsonb->>'proposal_id')::uuid,1,4,gen_random_uuid())::text,true);
select is((current_setting('test.declined')::jsonb->>'proposal_status'),'declined','trainer can decline client proposal');
select is((current_setting('test.declined')::jsonb->>'booking_revision')::integer,4,'decline leaves booking unchanged');
reset role;
insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,finished_at)
select gen_random_uuid(),workspace_id,id,client_record_id,now() from public.bookings where id=current_setting('test.booking')::uuid;
set local role authenticated;
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,current_setting('test.target')::timestamptz,gen_random_uuid())$$,'55000',null,'finished journal blocks proposal');
select set_config('test.canceled',public.cancel_booking((current_setting('test.group')::jsonb->'booking_ids'->>1)::uuid,1,gen_random_uuid())::text,true);
select throws_ok($$select public.propose_booking_reschedule((current_setting('test.group')::jsonb->'booking_ids'->>1)::uuid,2,current_setting('test.target')::timestamptz,gen_random_uuid())$$,'55000',null,'cancelled peer cannot be rescheduled');
reset role;
update public.workout_instances set finished_at=null where booking_id=current_setting('test.booking')::uuid;
set local role authenticated;
select set_config('test.cancelmain',public.cancel_booking(current_setting('test.booking')::uuid,4,gen_random_uuid())::text,true);
select is((public.accept_booking_reschedule(current_setting('test.pid')::uuid,2,1,'87000000-0000-4000-8000-000000000051')->>'booking_revision')::integer,2,'replay returns original acceptance after later cancellation');
select is((select status from public.bookings where id=current_setting('test.booking')::uuid),'cancelled_by_trainer','replay cannot resurrect cancelled booking');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,4,current_setting('test.target')::timestamptz,gen_random_uuid())$$,'P0002',null,'foreign owner cannot propose for known booking');
select is((select count(*)::integer from public.schedule_proposals),0,'foreign owner cannot read proposals');
reset role;
select ok(not has_table_privilege('authenticated','private.booking_reschedule_receipts','SELECT'),'command receipts private');
select * from finish();
rollback;
