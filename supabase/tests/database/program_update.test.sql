begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(47);
insert into auth.users(id,aud,role,email) values
 ('52000000-0000-4000-8000-000000000001','authenticated','authenticated','program-update-owner@example.test'),
 ('52000000-0000-4000-8000-000000000002','authenticated','authenticated','program-update-client@example.test');
insert into public.trainer_workspaces(id,owner_user_id,name) values('52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000001','Synthetic update workspace');
insert into public.client_records(id,workspace_id,user_id,display_name) values('52000000-0000-4000-8000-000000000004','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000002','Synthetic client');
set local role authenticated;
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000001',true);
select set_config('test.template',public.save_workout_template(null,null,'Synthetic plan','',jsonb_build_array(
 jsonb_build_object('exercise_id',(select id from public.exercises where workspace_id='52000000-0000-4000-8000-000000000003' and source_key='e0'),'planned_sets',3,'planned_reps','8'),
 jsonb_build_object('exercise_id',(select id from public.exercises where workspace_id='52000000-0000-4000-8000-000000000003' and source_key='e69'),'planned_sets',2,'planned_seconds','30')
),gen_random_uuid())::text,true);
select set_config('test.source',public.assign_client_program('52000000-0000-4000-8000-000000000004',(current_setting('test.template')::jsonb->>'id')::uuid,(current_setting('test.template')::jsonb->>'revision')::integer,gen_random_uuid())->>'id',true);
reset role;
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values('52000000-0000-4000-8000-000000000005','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000004',now()+interval '180 days',now()+interval '180 days 1 hour','confirmed');
insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,source_program_id,source_program_revision,finished_at) values('52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000005','52000000-0000-4000-8000-000000000004',current_setting('test.source')::uuid,1,now());
insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g)
select case when position=0 then '52000000-0000-4000-8000-000000000007'::uuid else '52000000-0000-4000-8000-000000000008'::uuid end,workspace_id,'52000000-0000-4000-8000-000000000006',exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g from public.client_program_exercises where client_program_id=current_setting('test.source')::uuid;
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id) values('52000000-0000-4000-8000-000000000009','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000007',0,10,10000,'52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000010');
select set_config('test.journal',(select to_jsonb(w)::text from public.workout_instances w where id='52000000-0000-4000-8000-000000000006'),true);
select set_config('test.program',(select jsonb_agg(to_jsonb(e) order by position)::text from public.client_program_exercises e where client_program_id=current_setting('test.source')::uuid),true);
create function pg_temp.update_program(keys text[],request uuid default '52000000-0000-4000-8000-000000000011',pr integer default 1,wr integer default 1) returns jsonb language sql as $$
 select public.update_client_program('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000004','52000000-0000-4000-8000-000000000006',current_setting('test.source')::uuid,pr,wr,keys,request);
$$;
set local role authenticated;
select ok(not has_table_privilege('authenticated','private.program_update_receipts','SELECT'),'receipts private');
select ok(not has_function_privilege('anon','public.update_client_program(uuid,uuid,uuid,uuid,uuid,integer,integer,text[],uuid)','EXECUTE'),'anon denied');
select is(jsonb_array_length(public.get_program_update('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000004')->'options'),1,'partial finished journal offers saved values');
select throws_ok($$select pg_temp.update_program(array[]::text[])$$,'22023',null,'empty choice rejected');
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007','values:52000000-0000-4000-8000-000000000007'])$$,'22023',null,'duplicate rejected');
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000099'])$$,'22023',null,'foreign exercise rejected');
select throws_ok($$select pg_temp.update_program(array['garbage'])$$,'22023',null,'malformed rejected');
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'],gen_random_uuid(),99)$$,'40001',null,'stale program rejected');
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'],gen_random_uuid(),1,99)$$,'40001',null,'stale journal rejected');
select is((select count(*)::integer from public.client_programs where client_record_id='52000000-0000-4000-8000-000000000004'),1,'failures create no partial rows');
select throws_ok($$select public.get_program_update('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000099','52000000-0000-4000-8000-000000000004')$$,'P0002',null,'foreign or unavailable journal rejected');
select throws_ok($$select public.get_program_update('52000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000004')$$,'42501',null,'caller identity pinned independently of owned workspace');
select set_config('test.result',pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'])::text,true);
select is(pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'])::text,current_setting('test.result'),'exact replay');
select throws_ok($$select pg_temp.update_program(array['sets:52000000-0000-4000-8000-000000000007'])$$,'22023',null,'same id different intent rejected');
select is((select planned_weight_g from public.client_program_exercises where client_program_id=(current_setting('test.result')::jsonb->>'program_id')::uuid and position=0),10000,'last saved weight');
select is((select planned_reps from public.client_program_exercises where client_program_id=(current_setting('test.result')::jsonb->>'program_id')::uuid and position=0),'10','last saved reps');
select is((select planned_sets from public.client_program_exercises where client_program_id=(current_setting('test.result')::jsonb->>'program_id')::uuid and position=0),3,'partial finish keeps planned count');
select is((select planned_seconds from public.client_program_exercises where client_program_id=(current_setting('test.result')::jsonb->>'program_id')::uuid and position=1),'30','unselected exercise preserved in order');
reset role;
select is((select jsonb_agg(to_jsonb(e) order by position)::text from public.client_program_exercises e where client_program_id=current_setting('test.source')::uuid),current_setting('test.program'),'old copy immutable');
select is((select to_jsonb(w)::text from public.workout_instances w where id='52000000-0000-4000-8000-000000000006'),current_setting('test.journal'),'journal unchanged');
select throws_ok($$update private.program_update_receipts set provenance='{}' where request_id='52000000-0000-4000-8000-000000000011'$$,'22023',null,'receipt provenance immutable even to table owner');
select is((select provenance->>'program_id' from private.program_update_receipts where request_id='52000000-0000-4000-8000-000000000011'),current_setting('test.source'),'source provenance');
select is((select provenance->>'workout_revision' from private.program_update_receipts where request_id='52000000-0000-4000-8000-000000000011'),'1','journal provenance');
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.client_programs),2,'client sees old and new copies');
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'])$$,'42501',null,'client cannot write');
reset role;
select set_config('request.jwt.claim.sub','52000000-0000-4000-8000-000000000001',true);
update public.client_records set archived_at=now() where id='52000000-0000-4000-8000-000000000004';
set local role authenticated;
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'],gen_random_uuid())$$,'P0002',null,'archived client rejected');
select is(pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'])::text,current_setting('test.result'),'committed replay survives archive');
reset role;
update public.client_records set archived_at=null where id='52000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('test.correction',public.apply_operations('52000000-0000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object(
 'operation_id','52000000-0000-4000-8000-000000000012','entity_id','52000000-0000-4000-8000-000000000009','device_id','52000000-0000-4000-8000-000000000010','kind','upsert_set','base_revision',1,'created_at','2026-10-04T12:00:00Z',
 'payload',jsonb_build_object('workout_instance_id','52000000-0000-4000-8000-000000000006','workout_exercise_id','52000000-0000-4000-8000-000000000007','position',0,'reps',11,'seconds',null,'weight_g',11000)
)))::text,true);
select is(current_setting('test.correction')::jsonb->'results'->0->>'status','correction_draft','late result remains a draft');
select set_config('test.applied_correction',public.apply_workout_correction('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006',(current_setting('test.correction')::jsonb->'results'->0->>'draft_id')::uuid,gen_random_uuid(),1,1,1)::text,true);
select is((select count(*)::integer from public.client_programs),2,'correction alone does not create a program');
select is((public.get_program_update('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000004')->'options'->0->'fact'->>'reps'),'11','correction offers fresh values');
select set_config('test.source',current_setting('test.result')::jsonb->>'program_id',true);
select set_config('test.corrected_program',pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'],gen_random_uuid(),1,2)::text,true);
select is((select planned_reps from public.client_program_exercises where client_program_id=(current_setting('test.corrected_program')::jsonb->>'program_id')::uuid and position=0),'11','explicit repeat after correction creates another immutable copy');
reset role;
update public.set_results set reps=1000 where id='52000000-0000-4000-8000-000000000009';
set local role authenticated;
select set_config('test.source',current_setting('test.corrected_program')::jsonb->>'program_id',true);
select throws_ok($$select pg_temp.update_program(array['values:52000000-0000-4000-8000-000000000007'],gen_random_uuid(),1,2)$$,'23514',null,'malformed transferable value rolls back copied rows');
select is((select count(*)::integer from public.client_programs),3,'constraint failure leaves no partial program');
reset role;
update public.set_results set reps=11 where id='52000000-0000-4000-8000-000000000009';
insert into public.client_records(id,workspace_id,display_name) values('52000000-0000-4000-8000-000000000020','52000000-0000-4000-8000-000000000003','Synthetic fresh client');
set local role authenticated;
select set_config('test.booking',public.create_booking_set_with_plan(array['52000000-0000-4000-8000-000000000020'::uuid],now()+interval '181 days',now()+interval '181 days 1 hour',false,gen_random_uuid(),(current_setting('test.template')::jsonb->>'id')::uuid,(current_setting('test.template')::jsonb->>'revision')::integer)::text,true);
select set_config('test.prepared',public.prepare_workout_journal((current_setting('test.booking')::jsonb->'booking_ids'->>0)::uuid,'52000000-0000-4000-8000-000000000021',gen_random_uuid())::text,true);
select set_config('test.prepared_exercise',(select id::text from public.workout_exercises where workout_instance_id='52000000-0000-4000-8000-000000000021' and position=0),true);
select set_config('test.saved',public.apply_operations('52000000-0000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object('operation_id',gen_random_uuid(),'entity_id',gen_random_uuid(),'device_id','52000000-0000-4000-8000-000000000010','kind','upsert_set','base_revision',0,'created_at','2026-10-04T12:00:00Z',
 'payload',jsonb_build_object('workout_instance_id','52000000-0000-4000-8000-000000000021','workout_exercise_id',current_setting('test.prepared_exercise'),'position',0,'reps',12,'seconds',null,'weight_g',14000))))::text,true);
select set_config('test.finished',public.apply_operations('52000000-0000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object('operation_id',gen_random_uuid(),'entity_id','52000000-0000-4000-8000-000000000021','device_id','52000000-0000-4000-8000-000000000010','kind','finish_workout','base_revision',1,'created_at','2026-10-04T12:00:00Z','payload','{}'::jsonb)))::text,true);
select is(current_setting('test.finished')::jsonb->'results'->0->>'status','applied','production preparation → saved partial result → finish');
select set_config('test.offer',public.get_program_update('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000021','52000000-0000-4000-8000-000000000020')::text,true);
select is(current_setting('test.offer')::jsonb->>'source_kind','booking','actual SOM-31 snapshot is supported without rewriting finish');
select set_config('test.first_copy',public.update_client_program('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000020','52000000-0000-4000-8000-000000000021',(current_setting('test.offer')::jsonb->>'program_id')::uuid,1,(current_setting('test.offer')::jsonb->>'workout_revision')::integer,array['values:'||current_setting('test.prepared_exercise')],gen_random_uuid())::text,true);
select is((select planned_reps from public.client_program_exercises where client_program_id=(current_setting('test.first_copy')::jsonb->>'program_id')::uuid and position=0),'12','first personal copy reads saved production values');
select is((select planned_sets from public.client_program_exercises where client_program_id=(current_setting('test.first_copy')::jsonb->>'program_id')::uuid and position=0),3,'partial finish does not reduce plan');
reset role;
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id,deleted_at)
values('52000000-0000-4000-8000-000000000030','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000007',9,50,50000,'52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000010',now());
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id)
values('52000000-0000-4000-8000-000000000031','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000007',4,11,11000,'52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000010');
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,seconds,weight_g,author_user_id,device_id)
values('52000000-0000-4000-8000-000000000036','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000008',0,35,0,'52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000010');
set local role authenticated;
select set_config('test.set_offer',public.get_program_update('52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000004')::text,true);
select is((current_setting('test.set_offer')::jsonb->'options'->0->'fact'->>'sets')::integer,5,'last saved index defines extra count; deleted index is ignored');
select is((current_setting('test.set_offer')::jsonb->'options'->0->>'checked'),'false','extra count is opt-in');
select set_config('test.extra_program',pg_temp.update_program(array['sets:52000000-0000-4000-8000-000000000007','values:52000000-0000-4000-8000-000000000008'],gen_random_uuid(),1,2)::text,true);
select is((select planned_sets from public.client_program_exercises where client_program_id=(current_setting('test.extra_program')::jsonb->>'program_id')::uuid and position=0),5,'selected extra count transfers');
select is((select planned_seconds from public.client_program_exercises where client_program_id=(current_setting('test.extra_program')::jsonb->>'program_id')::uuid and position=1),'35','timed saved result transfers seconds with zero weight');
reset role;
update public.workout_exercises set skipped=true where id='52000000-0000-4000-8000-000000000008';
set local role authenticated;
select set_config('test.source',current_setting('test.extra_program')::jsonb->>'program_id',true);
select set_config('test.skip_program',pg_temp.update_program(array['skip:52000000-0000-4000-8000-000000000008'],gen_random_uuid(),1,2)::text,true);
select is((select count(*)::integer from public.client_program_exercises where client_program_id=(current_setting('test.skip_program')::jsonb->>'program_id')::uuid),1,'selected skip removes only chosen exercise');
reset role;
insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets)
select '52000000-0000-4000-8000-000000000032',workspace_id,'52000000-0000-4000-8000-000000000006',id,name,measure,bodyweight,muscle_group,equipment,instructions,2,2 from public.exercises where workspace_id='52000000-0000-4000-8000-000000000003' and source_key='e1';
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id)
values('52000000-0000-4000-8000-000000000033','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000032',0,8,8000,'52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000010');
set local role authenticated;
select set_config('test.source',current_setting('test.skip_program')::jsonb->>'program_id',true);
select set_config('test.add_program',pg_temp.update_program(array['add:52000000-0000-4000-8000-000000000032'],gen_random_uuid(),1,2)::text,true);
select is((select count(*)::integer from public.client_program_exercises where client_program_id=(current_setting('test.add_program')::jsonb->>'program_id')::uuid),2,'added exercise appended once');
select is((select planned_sets from public.client_program_exercises where client_program_id=(current_setting('test.add_program')::jsonb->>'program_id')::uuid and position=1),2,'addition preserves its planned count');
reset role;
update public.workout_exercises set skipped=true where id='52000000-0000-4000-8000-000000000032';
insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,replaced_from_id)
select '52000000-0000-4000-8000-000000000034',workspace_id,'52000000-0000-4000-8000-000000000006',id,name,measure,bodyweight,muscle_group,equipment,instructions,3,3,'52000000-0000-4000-8000-000000000032' from public.exercises where workspace_id='52000000-0000-4000-8000-000000000003' and source_key='e2';
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id)
values('52000000-0000-4000-8000-000000000035','52000000-0000-4000-8000-000000000003','52000000-0000-4000-8000-000000000006','52000000-0000-4000-8000-000000000034',0,9,9000,'52000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000010');
set local role authenticated;
select set_config('test.source',current_setting('test.add_program')::jsonb->>'program_id',true);
select set_config('test.replace_program',pg_temp.update_program(array['replace:52000000-0000-4000-8000-000000000034'],gen_random_uuid(),1,2)::text,true);
select is((select count(*)::integer from public.client_program_exercises where client_program_id=(current_setting('test.replace_program')::jsonb->>'program_id')::uuid),2,'replacement keeps exercise count');
select is((select planned_sets from public.client_program_exercises where client_program_id=(current_setting('test.replace_program')::jsonb->>'program_id')::uuid and position=1),2,'replacement keeps original planned count');
select is((select planned_reps from public.client_program_exercises where client_program_id=(current_setting('test.replace_program')::jsonb->>'program_id')::uuid and position=1),'9','replacement carries last saved reps in original position');
reset role;
select * from finish();
rollback;
