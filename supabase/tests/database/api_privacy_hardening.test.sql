begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(80);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('56000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'journal-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('56000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'journal-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('56000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'journal-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('56000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'journal-client-peer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('56000000-0000-4000-8000-000000000001', 'Journal owner A'),
  ('56000000-0000-4000-8000-000000000002', 'Journal owner B'),
  ('56000000-0000-4000-8000-000000000003', 'Journal client A'),
  ('56000000-0000-4000-8000-000000000004', 'Journal peer');

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Journal workspace A'),
  ('66000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000002', 'Journal workspace B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('76000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000003', 'Journal client A'),
  ('76000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000004', 'Journal peer'),
  ('76000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000002', null, 'Foreign client');

insert into public.group_sessions (id, workspace_id, starts_at, ends_at)
values ('86000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour');

insert into public.bookings (id, workspace_id, client_record_id, group_session_id, starts_at, ends_at, status)
values
  ('96000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', '86000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed'),
  ('96000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002', '86000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'confirmed'),
  ('96000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', null, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed'),
  ('96000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000003', null, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed');

insert into public.workout_templates (id, workspace_id, name)
values ('a6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'Journal source'),
       ('a6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000002', 'Foreign source');
insert into public.client_programs (id, workspace_id, client_record_id, base_template_id, base_template_revision, name)
values
  ('a7000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 1, 'Client A program'),
  ('a7000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', 1, 'Peer program'),
  ('a7000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000003', 'a6000000-0000-4000-8000-000000000002', 1, 'Foreign program');

insert into public.workout_instances (id, workspace_id, booking_id, client_record_id, source_program_id, source_program_revision, finished_at)
values
  ('b6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 1, now()),
  ('b6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000002', '76000000-0000-4000-8000-000000000002', 'a7000000-0000-4000-8000-000000000002', 1, now()),
  ('b6000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', '96000000-0000-4000-8000-000000000003', '76000000-0000-4000-8000-000000000001', null, null, null),
  ('b6000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000002', '96000000-0000-4000-8000-000000000004', '76000000-0000-4000-8000-000000000003', 'a7000000-0000-4000-8000-000000000003', 1, now());

select set_config('test.reps_exercise', (select id::text from public.exercises where workspace_id = '66000000-0000-4000-8000-000000000001' and source_key = 'e0'), true);
select set_config('test.seconds_exercise', (select id::text from public.exercises where workspace_id = '66000000-0000-4000-8000-000000000001' and source_key = 'e69'), true);
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_reps)
values ('c6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.reps_exercise')::uuid, 'Squat snapshot', 'reps', false, 'Legs', 'barbell', '{}', 0, 3, '8–12');
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_seconds)
values ('c6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.seconds_exercise')::uuid, 'Plank snapshot', 'seconds', true, 'Core', 'bodyweight', '{}', 1, 2, '30');
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets, planned_reps)
values ('c6000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000002', current_setting('test.reps_exercise')::uuid, 'Peer squat', 'reps', false, 'Legs', 'barbell', '{}', 0, 3, '8');
insert into public.workout_exercises (id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot, instructions_snapshot, position, planned_sets)
values ('c6000000-0000-4000-8000-000000000004', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', current_setting('test.reps_exercise')::uuid, 'Unplanned added exercise', 'reps', false, 'Legs', 'barbell', '{}', 50, 0);

insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, reps, weight_g, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 0, 0, 0, '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, seconds, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000002', 0, 0, '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.set_results (id, workspace_id, workout_instance_id, workout_exercise_id, position, author_user_id, device_id)
values ('d6000000-0000-4000-8000-000000000003', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'c6000000-0000-4000-8000-000000000001', 1, '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.session_notes (id, workspace_id, workout_instance_id, text, author_user_id, device_id)
values ('f6000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Shared session note', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.private_notes (id, workspace_id, workout_instance_id, text, author_user_id, device_id)
values ('f7000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'Trainer private note', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.private_notes (id, workspace_id, client_record_id, text, author_user_id, device_id)
values ('f7000000-0000-4000-8000-000000000002', '66000000-0000-4000-8000-000000000001', '76000000-0000-4000-8000-000000000001', 'Client private note', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001');
insert into public.sync_operations (operation_id, workspace_id, user_id, device_id, kind, entity_id, base_revision, result)
values ('f8000000-0000-4000-8000-000000000001', '66000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'e6000000-0000-4000-8000-000000000001', 'set_result.create', 'd6000000-0000-4000-8000-000000000001', 0, '{"private":"possible receipt payload"}');


insert into public.client_records(id,workspace_id,user_id,display_name,archived_at)
values
('76000000-0000-4000-8000-000000000004','66000000-0000-4000-8000-000000000001','56000000-0000-4000-8000-000000000003','Archived client',now()),
('76000000-0000-4000-8000-000000000005','66000000-0000-4000-8000-000000000001',null,'Unlinked client',null);
insert into public.client_program_exercises(id,workspace_id,client_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps)
select 'c7000000-0000-4000-8000-000000000001',workspace_id,'a7000000-0000-4000-8000-000000000001',exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,0,3,'8'
from public.workout_exercises where id='c6000000-0000-4000-8000-000000000001';
insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets)
select 'c6000000-0000-4000-8000-000000000005',workspace_id,'b6000000-0000-4000-8000-000000000003',exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,0,0
from public.workout_exercises where id='c6000000-0000-4000-8000-000000000001';
insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id)
values(gen_random_uuid(),'66000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000003','Draft private to owner','56000000-0000-4000-8000-000000000001',gen_random_uuid());
insert into public.schedule_proposals(id,workspace_id,booking_id,author_user_id,proposed_starts_at,proposed_ends_at,base_revision,status)
values
('57000000-0000-4000-8000-000000000002','66000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','56000000-0000-4000-8000-000000000001',now()+interval '100 days',now()+interval '100 days 1 hour',1,'pending'),
('57000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','56000000-0000-4000-8000-000000000004',now()+interval '3 days',now()+interval '3 days 1 hour',1,'pending'),
('57000000-0000-4000-8000-000000000003','66000000-0000-4000-8000-000000000002','96000000-0000-4000-8000-000000000004','56000000-0000-4000-8000-000000000002',now()+interval '3 days',now()+interval '3 days 1 hour',1,'pending');
select ok(not has_table_privilege('authenticated','public.client_programs','SELECT'),'no table-level SELECT on client_programs');
select ok(has_column_privilege('authenticated','public.client_programs','id','SELECT'),'safe id granted on client_programs');
select ok(not has_column_privilege('authenticated','public.client_programs','created_by','SELECT'),'audit client_programs.created_by unavailable');
select ok(not has_any_column_privilege('anon','public.client_programs','SELECT'),'anon has no columns on client_programs');
select ok(not has_table_privilege('authenticated','public.client_program_exercises','SELECT'),'no table-level SELECT on client_program_exercises');
select ok(has_column_privilege('authenticated','public.client_program_exercises','id','SELECT'),'safe id granted on client_program_exercises');
select ok(not has_column_privilege('authenticated','public.client_program_exercises','created_by','SELECT'),'audit client_program_exercises.created_by unavailable');
select ok(not has_any_column_privilege('anon','public.client_program_exercises','SELECT'),'anon has no columns on client_program_exercises');
select ok(not has_table_privilege('authenticated','public.workout_instances','SELECT'),'no table-level SELECT on workout_instances');
select ok(has_column_privilege('authenticated','public.workout_instances','id','SELECT'),'safe id granted on workout_instances');
select ok(not has_column_privilege('authenticated','public.workout_instances','created_by','SELECT'),'audit workout_instances.created_by unavailable');
select ok(not has_any_column_privilege('anon','public.workout_instances','SELECT'),'anon has no columns on workout_instances');
select ok(not has_table_privilege('authenticated','public.workout_exercises','SELECT'),'no table-level SELECT on workout_exercises');
select ok(has_column_privilege('authenticated','public.workout_exercises','id','SELECT'),'safe id granted on workout_exercises');
select ok(not has_column_privilege('authenticated','public.workout_exercises','created_by','SELECT'),'audit workout_exercises.created_by unavailable');
select ok(not has_any_column_privilege('anon','public.workout_exercises','SELECT'),'anon has no columns on workout_exercises');
select ok(not has_table_privilege('authenticated','public.set_results','SELECT'),'no table-level SELECT on set_results');
select ok(has_column_privilege('authenticated','public.set_results','id','SELECT'),'safe id granted on set_results');
select ok(not has_column_privilege('authenticated','public.set_results','created_by','SELECT'),'audit set_results.created_by unavailable');
select ok(not has_column_privilege('authenticated','public.set_results','author_user_id','SELECT'),'audit set_results.author_user_id unavailable');
select ok(not has_column_privilege('authenticated','public.set_results','device_id','SELECT'),'audit set_results.device_id unavailable');
select ok(not has_any_column_privilege('anon','public.set_results','SELECT'),'anon has no columns on set_results');
select ok(not has_table_privilege('authenticated','public.session_notes','SELECT'),'no table-level SELECT on session_notes');
select ok(has_column_privilege('authenticated','public.session_notes','id','SELECT'),'safe id granted on session_notes');
select ok(not has_column_privilege('authenticated','public.session_notes','created_by','SELECT'),'audit session_notes.created_by unavailable');
select ok(not has_column_privilege('authenticated','public.session_notes','author_user_id','SELECT'),'audit session_notes.author_user_id unavailable');
select ok(not has_column_privilege('authenticated','public.session_notes','device_id','SELECT'),'audit session_notes.device_id unavailable');
select ok(not has_any_column_privilege('anon','public.session_notes','SELECT'),'anon has no columns on session_notes');
select ok(not has_column_privilege('authenticated','public.schedule_proposals','author_user_id','SELECT'),'proposal author UUID unavailable');
select ok(has_function_privilege('authenticated','public.get_my_workspace_schedule_proposals(uuid,integer,integer)','EXECUTE'),'trainer RPC granted');
select ok(not has_function_privilege('anon','public.get_my_workspace_schedule_proposals(uuid,integer,integer)','EXECUTE'),'anon RPC denied');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(id)::integer from public.workout_instances),1,'client safe parent RLS sees own finished only');
select is((select count(id)::integer from public.workout_exercises),3,'child policy traverses safe parent columns');
select is((select count(id)::integer from public.set_results),3,'client safe actual results visible');
select is((select count(id)::integer from public.session_notes),1,'unfinished shared notes hidden');
select is((select count(id)::integer from public.client_programs),1,'client copy scope preserved');
select is((select count(id)::integer from public.client_program_exercises),1,'client copy exercise traversal preserved');
select is((select count(id)::integer from public.private_notes),0,'private notes stay owner-only');
select is((select count(operation_id)::integer from public.sync_operations),0,'sync audit remains owner-only');
select throws_ok($$select * from public.workout_instances$$,'42501',null,'wildcard journal read denied');
select throws_ok($$select created_by from public.client_programs$$,'42501',null,'copy creator unavailable');
select throws_ok($$select id from public.client_program_exercises order by created_by$$,'42501',null,'copy audit cannot be used for ordering');
select throws_ok($$select id from public.set_results where author_user_id=auth.uid()$$,'42501',null,'author cannot be used for inference filtering');
select throws_ok($$select device_id from public.session_notes$$,'42501',null,'note device unavailable');
select throws_ok($$select author_user_id from public.schedule_proposals$$,'42501',null,'direct proposal author unavailable');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')$$,'P0002',null,'client cannot read owner proposal RPC');
select is((select author_role from public.get_my_client_schedule_proposals('76000000-0000-4000-8000-000000000001')),'trainer','client existing redacted RPC still reads definer author');
select throws_ok($$select public.get_my_client_schedule_context('76000000-0000-4000-8000-000000000004')$$,'P0002',null,'archived linked context still unavailable');
select throws_ok($$select public.get_my_client_schedule_context('76000000-0000-4000-8000-000000000005')$$,'P0002',null,'unlinked context still unavailable');

select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(id)::integer from public.workout_instances),3,'owner still reads own unfinished and finished journals');
select is((select count(id)::integer from public.session_notes),2,'owner safe notes include own draft');
select is((select count(id)::integer from public.client_programs),2,'owner safe copies include both clients');
select is((select count(*)::integer from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')),2,'trainer RPC includes all-time pending outside viewport');
select is((select string_agg(author_role,',' order by proposed_starts_at,id) from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')),'client,trainer','safe author roles and time ordering');
select is((select id::text from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',1,1)),'57000000-0000-4000-8000-000000000002','stable offset pagination');
select is((select count(*)::integer from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',2,1)),0,'page after end empty');
select is((select array_agg(key order by key) from jsonb_object_keys((select to_jsonb(p) from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',0,1)p)) as keys(key)),array['author_role','base_revision','booking_id','created_at','id','proposed_ends_at','proposed_starts_at','revision','status','updated_at','workspace_id'],'RPC has exact safe keys');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000002')$$,'P0002',null,'owner cannot read foreign workspace');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000099')$$,'P0002',null,'unknown workspace unavailable');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals(null)$$,'22023',null,'null workspace rejected');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',-1,1)$$,'22023',null,'negative page offset rejected');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',0,0)$$,'22023',null,'zero page limit rejected');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',0,501)$$,'22023',null,'oversized page rejected');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',null,1)$$,'22023',null,'null offset rejected');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001',0,null)$$,'22023',null,'null page limit rejected');
select throws_ok($$update public.client_programs set name='Mutated'$$,'42501',null,'direct copy mutation still denied');
select throws_ok($$delete from public.set_results$$,'42501',null,'direct journal mutation still denied');
select lives_ok($$select public.withdraw_booking_reschedule('57000000-0000-4000-8000-000000000002',1,1,'58000000-0000-4000-8000-000000000001')$$,'definer command uses inaccessible stored author');
select is((public.withdraw_booking_reschedule('57000000-0000-4000-8000-000000000002',1,1,'58000000-0000-4000-8000-000000000001')->>'replayed')::boolean,true,'actor receipt replay remains available');
select is((select count(*)::integer from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')),1,'withdrawn proposal excluded');

select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(id)::integer from public.workout_instances),1,'peer sees only own finished journal');
select is((select count(id)::integer from public.set_results),0,'peer does not gain other clients result rows');
select is((select author_role from public.get_my_client_schedule_proposals('76000000-0000-4000-8000-000000000002')),'client','second client safe own proposal remains accessible');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')$$,'P0002',null,'second client cannot call owner RPC');
select set_config('request.jwt.claims','{"sub":"56000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(id)::integer from public.workout_instances),1,'foreign owner sees only own workspace');
select is((select count(*)::integer from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000002')),1,'foreign owner own RPC works');
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')$$,'P0002',null,'foreign owner denied first workspace');
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')$$,'42501',null,'missing identity denied');
reset role;
set local role anon;
select throws_ok($$select * from public.get_my_workspace_schedule_proposals('66000000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous execution denied');
select throws_ok($$select id from public.session_notes$$,'42501',null,'anonymous column reads denied');
reset role;
select * from finish();
rollback;
