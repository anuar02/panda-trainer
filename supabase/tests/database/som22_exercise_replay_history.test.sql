begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,aud,role,email) values
('00000001-0000-4000-8000-000000000022','authenticated','authenticated','som22-owner@example.test'),
('00000002-0000-4000-8000-000000000022','authenticated','authenticated','som22-client@example.test'),
('00000003-0000-4000-8000-000000000022','authenticated','authenticated','som22-other@example.test');
insert into public.profiles(user_id,display_name) values
('00000001-0000-4000-8000-000000000022','Synthetic owner'),
('00000002-0000-4000-8000-000000000022','Synthetic client'),
('00000003-0000-4000-8000-000000000022','Synthetic other');
insert into public.trainer_workspaces(id,owner_user_id,name) values
('00000004-0000-4000-8000-000000000022','00000001-0000-4000-8000-000000000022','SOM22 fixture'),
('00000005-0000-4000-8000-000000000022','00000003-0000-4000-8000-000000000022','SOM22 foreign');
insert into public.client_records(id,workspace_id,user_id,display_name) values
('00000006-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','00000002-0000-4000-8000-000000000022','Synthetic client');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000001-0000-4000-8000-000000000022","role":"authenticated"}',true);
select ok(has_column_privilege('authenticated','public.exercises','id','INSERT'),'durable exercise UUID may be supplied on insert');
select ok(not has_column_privilege('authenticated','public.exercises','id','UPDATE'),'exercise identity cannot be changed');
select ok(not has_column_privilege('authenticated','public.exercises','source_key','INSERT'),'catalog provenance cannot be fabricated');
select ok(not has_table_privilege('authenticated','public.exercises','DELETE'),'hard delete remains unavailable');
select lives_ok($$insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight,aliases,instructions)
values('00000007-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','  Моя   Ёлка  ','Грудь','штанга','reps',false,array['Мой жим'],array['Контроль темпа'])$$,'owner creates custom exercise with durable replay UUID');
select is((select id::text from public.search_exercises('  МОЯ ЕЛКА  ')),'00000007-0000-4000-8000-000000000022','case/space/ё normalized search finds custom exercise');
select is((select id::text from public.search_exercises('МОЙ ЖИМ')),'00000007-0000-4000-8000-000000000022','aliases remain searchable');
select throws_ok($$insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight)
values('00000008-0000-4000-8000-000000000022','00000005-0000-4000-8000-000000000022','Foreign','Грудь','штанга','reps',false)$$,'42501',null,'supplying UUID does not bypass workspace RLS');
select throws_ok($$insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight)
values('00000008-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','моя елка','Спина','гантели','reps',false)$$,'23505',null,'different payload still hits existing normalized-name constraint');
select set_config('test.som22.template',public.save_workout_template(null,null,'SOM22 plan','Original',
'[{"exercise_id":"00000007-0000-4000-8000-000000000022","planned_sets":3,"planned_reps":"8–12","planned_weight_g":22500,"rest_seconds":90,"note":"Темп"}]'::jsonb,
'00000009-0000-4000-8000-000000000022')::text,true);
select set_config('test.som22.program',public.assign_client_program('00000006-0000-4000-8000-000000000022',
(current_setting('test.som22.template')::jsonb->>'id')::uuid,(current_setting('test.som22.template')::jsonb->>'revision')::integer,
'00000010-0000-4000-8000-000000000022')::text,true);
reset role;
select set_config('test.som22.program_before',(select to_jsonb(p)::text from public.client_program_exercises p where client_program_id=(current_setting('test.som22.program')::jsonb->>'id')::uuid),true);
select set_config('test.som22.line_before',(select to_jsonb(t)::text from public.template_exercises t where template_id=(current_setting('test.som22.template')::jsonb->>'id')::uuid),true);

insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values
('00000011-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','00000006-0000-4000-8000-000000000022',now()+interval '20 days',now()+interval '20 days 1 hour','confirmed');
insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,source_program_id,source_program_revision,finished_at)
values('00000012-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','00000011-0000-4000-8000-000000000022','00000006-0000-4000-8000-000000000022',(current_setting('test.som22.program')::jsonb->>'id')::uuid,1,now());
insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_weight_g,rest_seconds,note)
select '00000013-0000-4000-8000-000000000022',workspace_id,'00000012-0000-4000-8000-000000000022',exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,0,planned_sets,planned_reps,planned_weight_g,rest_seconds,note
from public.client_program_exercises where client_program_id=(current_setting('test.som22.program')::jsonb->>'id')::uuid;
insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id)
values('00000014-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','00000012-0000-4000-8000-000000000022','00000013-0000-4000-8000-000000000022',0,10,22500,'00000001-0000-4000-8000-000000000022','00000015-0000-4000-8000-000000000022');
select set_config('test.som22.history_before',(select to_jsonb(w)::text from public.workout_exercises w where id='00000013-0000-4000-8000-000000000022'),true);
select set_config('test.som22.result_before',(select to_jsonb(r)::text from public.set_results r where id='00000014-0000-4000-8000-000000000022'),true);
set local role authenticated;

select lives_ok($$update public.exercises set archived_at=now() where workspace_id='00000004-0000-4000-8000-000000000022' and id='00000007-0000-4000-8000-000000000022' and archived_at is null$$,'owner archives referenced custom exercise');
select is((select count(*)::integer from public.search_exercises('елка')),0,'archived exercise is absent from selectable search');
select is((select to_jsonb(t)::text from public.template_exercises t where template_id=(current_setting('test.som22.template')::jsonb->>'id')::uuid),current_setting('test.som22.line_before'),'archive does not rewrite existing template line or revision');
select is((select e.name from public.template_exercises t join public.exercises e on e.id=t.exercise_id and e.workspace_id=t.workspace_id where t.template_id=(current_setting('test.som22.template')::jsonb->>'id')::uuid),'Моя Ёлка','old template still resolves original name');
reset role;
select is((select to_jsonb(p)::text from public.client_program_exercises p where client_program_id=(current_setting('test.som22.program')::jsonb->>'id')::uuid),current_setting('test.som22.program_before'),'entire immutable client program row is unchanged');
select is((select to_jsonb(w)::text from public.workout_exercises w where id='00000013-0000-4000-8000-000000000022'),current_setting('test.som22.history_before'),'entire finished history exercise snapshot is unchanged');
select is((select to_jsonb(r)::text from public.set_results r where id='00000014-0000-4000-8000-000000000022'),current_setting('test.som22.result_before'),'archive does not rewrite recorded result');
set local role authenticated;
select set_config('test.som22.archive_before',(select archived_at::text || '|' || revision::text from public.exercises where id='00000007-0000-4000-8000-000000000022'),true);
update public.exercises set archived_at=now()+interval '1 hour' where workspace_id='00000004-0000-4000-8000-000000000022' and id='00000007-0000-4000-8000-000000000022' and archived_at is null;
select is((select archived_at::text || '|' || revision::text from public.exercises where id='00000007-0000-4000-8000-000000000022'),current_setting('test.som22.archive_before'),'conditional archive retry preserves original date and revision');
select throws_ok($$insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight,aliases,instructions)
values('00000007-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','Моя Ёлка','Грудь','штанга','reps',false,array['Мой жим'],array['Контроль темпа'])$$,'23505',null,'lost response replay UUID still conflicts after archive and cannot create duplicate');
select lives_ok($$insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight)
values('00000016-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','моя елка','Спина','гантели','reps',false)$$,'known outcome allows a separate new command to reuse an archived name');
select is((select id::text from public.search_exercises('ёлка')),'00000016-0000-4000-8000-000000000022','new selection resolves new UUID while old references remain old UUID');
select is((select exercise_id::text from public.template_exercises where template_id=(current_setting('test.som22.template')::jsonb->>'id')::uuid),'00000007-0000-4000-8000-000000000022','name reuse never repoints existing template');
select set_config('request.jwt.claims','{"sub":"00000002-0000-4000-8000-000000000022","role":"authenticated"}',true);
select is((select exercise_name_snapshot from public.client_program_exercises where client_program_id=(current_setting('test.som22.program')::jsonb->>'id')::uuid),'Моя Ёлка','linked client reads original program snapshot after archive and name reuse');
select is((select exercise_name_snapshot from public.workout_exercises where id='00000013-0000-4000-8000-000000000022'),'Моя Ёлка','linked client reads finished original history after archive');
select is((select reps::text || '|' || weight_g::text from public.set_results where id='00000014-0000-4000-8000-000000000022'),'10|22500','client finished result survives archive');
select throws_ok($$insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight)
values('00000017-0000-4000-8000-000000000022','00000004-0000-4000-8000-000000000022','Client attempt','Грудь','штанга','reps',false)$$,'42501',null,'linked client cannot create exercise with supplied UUID');
select * from finish();
rollback;
