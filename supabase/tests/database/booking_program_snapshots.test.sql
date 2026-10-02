begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

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
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('public.booking_programs'::regclass,'public.booking_program_exercises'::regclass)), 'snapshot tables enforce RLS');
select ok(not has_column_privilege('authenticated','public.booking_programs','created_by','SELECT'),'snapshot creator auth UUID stays private');
select ok(not has_column_privilege('authenticated','public.booking_program_exercises','created_by','SELECT'),'exercise creator auth UUID stays private');
select is((select count(*)::integer from public.booking_programs),2,'group creates independent snapshot for each participant');
select is((select count(*)::integer from public.booking_program_exercises),4,'every participant receives all exercises');
select is((select count(distinct booking_id)::integer from public.booking_programs),2,'snapshots bind individual bookings');
select is((select min(name || '|' || description) from public.booking_programs),'Strength plan|Initial description','metadata copied');
select is((select min(planned_sets::text || '|' || planned_reps || '|' || note) from public.booking_program_exercises where position=0),'4|8–12|Warm up','planned values copied');
select is((select min(measure_snapshot || '|' || planned_seconds) from public.booking_program_exercises where position=1),'seconds|30–45','timed plan copied');
select throws_ok($$update public.booking_programs set name='Changed'$$,'42501',null,'snapshot metadata immutable through API');
select throws_ok($$delete from public.booking_program_exercises$$,'42501',null,'snapshot exercises immutable through API');
select is((public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,gen_random_uuid(),current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)->>'created'),'false','unacknowledged overlap warns');
select is((select count(*)::integer from public.booking_programs),2,'warning has no partial snapshots');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),current_setting('test.template_id')::uuid,999)$$,'40001',null,'stale source rejected');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),'87000000-0000-4000-8000-000000000099',1)$$,'P0002',null,'foreign template unavailable');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000003'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)$$,'42501',null,'foreign participant rejects entire group');
select is((select count(*)::integer from public.booking_programs),2,'failed requests atomic');
select is((public.create_booking_set(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,'87000000-0000-4000-8000-000000000021')->>'created'),'true','legacy creation still works');
select is((select count(*)::integer from public.booking_programs),2,'no selection does not assign personal program');
select is((public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,'87000000-0000-4000-8000-000000000021',null,null)->>'replayed'),'true','seven-argument null selection replays legacy receipt');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',null,null)$$,'22023',null,'receipt binds selected plan');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),current_setting('test.template_id')::uuid,null)$$,'22023',null,'selection requires revision');
select is((select min(measure_snapshot || '|' || bodyweight_snapshot::text || '|' || muscle_group_snapshot || '|' || equipment_snapshot || '|' || source_key_snapshot) from public.booking_program_exercises where position=0),'reps|false|Ноги|штанга|e0','exercise metadata snapshot preserved');
reset role;
update public.exercises set archived_at=now() where workspace_id='67000000-0000-4000-8000-000000000001' and source_key='e0';
set local role authenticated;
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)$$,'23503',null,'archived exercise rejects new snapshot');
select is((select count(*)::integer from public.booking_programs),2,'invalid exercise creates no partial snapshot');
reset role;
update public.exercises set archived_at=null where workspace_id='67000000-0000-4000-8000-000000000001' and source_key='e0';
set local role authenticated;
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),'87000000-0000-4000-8000-000000000098',1)$$,'23514',null,'empty template rejected');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid,'77000000-0000-4000-8000-000000000002'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',current_setting('test.template_id')::uuid,999)$$,'22023',null,'replay binds original selected revision');
select set_config('test.archived',public.archive_workout_template(current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer,gen_random_uuid())::text,true);
select is((public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000002'::uuid,'77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,false,'87000000-0000-4000-8000-000000000020',current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)->>'replayed'),'true','replay survives source archive and normalized participant order');
select throws_ok($$select public.create_booking_set_with_plan(array['77000000-0000-4000-8000-000000000001'::uuid],current_setting('test.start')::timestamptz,current_setting('test.end')::timestamptz,true,gen_random_uuid(),current_setting('test.template_id')::uuid,current_setting('test.template_revision')::integer)$$,'P0002',null,'new archived source request rejected');
reset role;
update public.exercises set name='Renamed source' where workspace_id='67000000-0000-4000-8000-000000000001' and source_key='e0';
set local role authenticated;
select is((select min(exercise_name_snapshot) from public.booking_program_exercises where position=0),'Приседания со штангой','source changes cannot rewrite snapshots');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.booking_programs),1,'client sees own group snapshot only');
select is((select count(*)::integer from public.booking_program_exercises),2,'client sees own exercises only');
reset role;
select set_config('request.jwt.claims','{"sub":"57000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.booking_programs),0,'foreign trainer cannot read snapshots');
select is((select count(*)::integer from public.booking_program_exercises),0,'foreign trainer cannot read exercises');
reset role;
select * from finish();
rollback;
