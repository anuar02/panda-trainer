begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

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
select set_config('test.legacy_start',(current_setting('test.start')::timestamptz+interval '1 day')::text,true);
select set_config('test.legacy_end',(current_setting('test.end')::timestamptz+interval '1 day')::text,true);
select set_config('test.legacy',public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.legacy_start')::timestamptz,current_setting('test.legacy_end')::timestamptz,false,'87000000-0000-4000-8000-000000000022')::text,true);
select set_config('test.overlap',public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,'87000000-0000-4000-8000-000000000023')::text,true);
select is(jsonb_array_length(current_setting('test.overlap')::jsonb->'overlaps'),1,'acknowledged creation returns current conflicts');
select is((public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,'87000000-0000-4000-8000-000000000023')->'overlaps'),'[]'::jsonb,'successful replay preserves legacy empty overlaps contract');
select set_config('test.legacy_p',public.propose_booking_reschedule((current_setting('test.legacy')::jsonb->'booking_ids'->>1)::uuid,1,current_setting('test.start')::timestamptz+interval '3 days',gen_random_uuid())::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.accepted',public.accept_booking_reschedule((current_setting('test.legacy_p')::jsonb->>'proposal_id')::uuid,1,1,gen_random_uuid())::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.legacy_start')::timestamptz,current_setting('test.legacy_end')::timestamptz,false,'87000000-0000-4000-8000-000000000022')->'booking_ids'),current_setting('test.legacy')::jsonb->'booking_ids','legacy replay preserves nonanchor detached participant');
select set_config('test.plan_p',public.propose_booking_reschedule((current_setting('test.group')::jsonb->'booking_ids'->>0)::uuid,1,current_setting('test.start')::timestamptz+interval '4 days',gen_random_uuid())::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.accepted',public.accept_booking_reschedule((current_setting('test.plan_p')::jsonb->>'proposal_id')::uuid,1,1,gen_random_uuid())::text,true);
select throws_ok($$select public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid],now()+interval '1 day',now()+interval '1 day 1 hour',false,'87000000-0000-4000-8000-000000000022')$$,'42501',null,'client cannot replay owner creation receipt');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.archived',public.archive_workout_template(current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer,gen_random_uuid())::text,true);
select set_config('test.replayed',public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000002'::uuid,'77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)::text,true);
select is((current_setting('test.replayed')::jsonb->'booking_ids'),current_setting('test.group')::jsonb->'booking_ids','selected-plan replay preserves detached anchor after source archive');
select is((current_setting('test.replayed')::jsonb->>'group_session_id'),current_setting('test.group')::jsonb->>'group_session_id','receipt keeps original group identity');
select is((current_setting('test.replayed')::jsonb->>'replayed'),'true','detached group receipt reports replay');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',null,null)$$,'22023',null,'immutable receipt still binds selected plan');
reset role;
select ok(not has_table_privilege('authenticated','private.booking_creation_receipts','SELECT'),'creation receipts inaccessible');
select ok(not has_function_privilege('authenticated','private.create_booking_set_with_plan_impl(uuid[],timestamptz,timestamptz,boolean,uuid,uuid,integer)','EXECUTE'),'internal creation bypass inaccessible');
set local role authenticated;
select is((select count(*)::integer from public.booking_programs),2,'creation replay cannot recreate snapshots');
select set_config('test.otherplan_p',public.propose_booking_reschedule((current_setting('test.group')::jsonb->'booking_ids'->>1)::uuid,1,current_setting('test.start')::timestamptz+interval '5 days',gen_random_uuid())::text,true);
select set_config('test.legacyanchor_p',public.propose_booking_reschedule((current_setting('test.legacy')::jsonb->'booking_ids'->>0)::uuid,1,current_setting('test.start')::timestamptz+interval '6 days',gen_random_uuid())::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.accepted',public.accept_booking_reschedule((current_setting('test.otherplan_p')::jsonb->>'proposal_id')::uuid,1,1,gen_random_uuid())::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select set_config('test.accepted',public.accept_booking_reschedule((current_setting('test.legacyanchor_p')::jsonb->>'proposal_id')::uuid,1,1,gen_random_uuid())::text,true);
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is((public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.legacy_start')::timestamptz,current_setting('test.legacy_end')::timestamptz,false,'87000000-0000-4000-8000-000000000022')->'booking_ids'),current_setting('test.legacy')::jsonb->'booking_ids','legacy replay preserves detached anchor too');
select is((public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)->'booking_ids'),current_setting('test.group')::jsonb->'booking_ids','selected-plan replay preserves detached nonanchor too');

reset role;
select * from finish();
rollback;
