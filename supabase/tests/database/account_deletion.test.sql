begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

insert into auth.users(id,aud,role,email) values
 ('ad000000-0000-4000-8000-000000000001','authenticated','authenticated','delete-dual@example.test'),
 ('ad000000-0000-4000-8000-000000000002','authenticated','authenticated','delete-foreign@example.test'),
 ('ad000000-0000-4000-8000-000000000003','authenticated','authenticated','delete-client@example.test');
insert into public.profiles(user_id,display_name) values
 ('ad000000-0000-4000-8000-000000000001','Dual'),('ad000000-0000-4000-8000-000000000003','Client');
insert into public.trainer_workspaces(id,owner_user_id,name) values
 ('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000001','Owned'),
 ('ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000002','Preserved');
insert into public.client_records(id,workspace_id,user_id,display_name) values
 ('ad000000-0000-4000-8000-000000000020','ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000003','Client A'),
 ('ad000000-0000-4000-8000-000000000021','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000001','Dual B'),
 ('ad000000-0000-4000-8000-000000000022','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000003','Client B');
insert into public.client_purchases(id,workspace_id,client_record_id,title,units,price_minor,created_by) values
 ('ad000000-0000-4000-8000-000000000030','ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000020','Own',10,1000,'ad000000-0000-4000-8000-000000000001'),
 ('ad000000-0000-4000-8000-000000000031','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021','Foreign',10,1000,'ad000000-0000-4000-8000-000000000001'),
 ('ad000000-0000-4000-8000-000000000032','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000022','Shared',10,1000,'ad000000-0000-4000-8000-000000000002');
insert into public.payment_entries(id,workspace_id,client_record_id,purchase_id,kind,amount_minor,paid_on,method,created_by) values
 ('ad000000-0000-4000-8000-000000000040','ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000020','ad000000-0000-4000-8000-000000000030','payment',100,'2026-10-04','Kaspi','ad000000-0000-4000-8000-000000000001'),
 ('ad000000-0000-4000-8000-000000000041','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021','ad000000-0000-4000-8000-000000000031','payment',100,'2026-10-04','Kaspi','ad000000-0000-4000-8000-000000000001');
insert into public.payment_entries(workspace_id,client_record_id,purchase_id,kind,amount_minor,paid_on,method,reason,reverses_entry_id,created_by) values
 ('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000020','ad000000-0000-4000-8000-000000000030','reversal',-100,'2026-10-04','Kaspi','Correction','ad000000-0000-4000-8000-000000000040','ad000000-0000-4000-8000-000000000001');
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at) values
 ('ad000000-0000-4000-8000-000000000050','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000021','2026-10-04 12:00Z','2026-10-04 13:00Z');
insert into public.schedule_proposals(workspace_id,booking_id,author_user_id,proposed_starts_at,proposed_ends_at,base_revision) values
 ('ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000050','ad000000-0000-4000-8000-000000000001','2026-10-05 12:00Z','2026-10-05 13:00Z',1);
insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,finished_at) values
 ('ad000000-0000-4000-8000-000000000060','ad000000-0000-4000-8000-000000000011','ad000000-0000-4000-8000-000000000050','ad000000-0000-4000-8000-000000000021',now());
insert into private.billing_command_receipts(workspace_id,actor_user_id,request_id,command,payload,result) values
 ('ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000001',gen_random_uuid(),'fixture','{}','{}');
-- Both workspaces carry the complete FK graph, including archived/snapshot and
-- immutable/cyclic history. Foreign audit authors intentionally use the target.
create function pg_temp.fid(n integer,i integer) returns uuid language sql immutable as $$
 select ('ae000000-0000-4000-8000-'||lpad((i*1000+n)::text,12,'0'))::uuid;
$$;
do $$ declare i integer; w uuid; card uuid; actor uuid:='ad000000-0000-4000-8000-000000000001'; e public.exercises; t text; begin
 for i in 0..1 loop
  w:=case when i=0 then 'ad000000-0000-4000-8000-000000000010'::uuid else 'ad000000-0000-4000-8000-000000000011'::uuid end;
  card:=case when i=0 then 'ad000000-0000-4000-8000-000000000020'::uuid else 'ad000000-0000-4000-8000-000000000021'::uuid end;
  select * into strict e from public.exercises where workspace_id=w and source_key='e0';
  insert into public.workout_templates(id,workspace_id,name,archived_at) values(pg_temp.fid(1,i),w,'Archived template',now());
  insert into public.template_exercises(workspace_id,template_id,exercise_id,position,planned_sets,planned_reps) values(w,pg_temp.fid(1,i),e.id,0,3,'8');
  insert into public.client_programs(id,workspace_id,client_record_id,base_template_id,base_template_revision,name) values(pg_temp.fid(2,i),w,card,pg_temp.fid(1,i),1,'Historical plan');
  insert into public.client_program_exercises(workspace_id,client_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps)
   values(w,pg_temp.fid(2,i),e.id,e.name,e.measure,e.bodyweight,e.muscle_group,e.equipment,e.instructions,0,3,'8');
  insert into public.group_sessions(id,workspace_id,starts_at,ends_at) values(pg_temp.fid(3,i),w,'2026-11-01 12:00Z','2026-11-01 13:00Z');
  insert into public.bookings(id,workspace_id,client_record_id,group_session_id,starts_at,ends_at,status) values(pg_temp.fid(4,i),w,card,pg_temp.fid(3,i),'2026-11-01 12:00Z','2026-11-01 13:00Z','confirmed');
  insert into public.schedule_proposals(workspace_id,booking_id,author_user_id,proposed_starts_at,proposed_ends_at,base_revision) values(w,pg_temp.fid(4,i),actor,'2026-11-02 12:00Z','2026-11-02 13:00Z',1);
  insert into public.booking_programs(id,workspace_id,booking_id,base_template_id,base_template_revision,name) values(pg_temp.fid(5,i),w,pg_temp.fid(4,i),pg_temp.fid(1,i),1,'Booking snapshot');
  insert into public.booking_program_exercises(workspace_id,booking_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps)
   values(w,pg_temp.fid(5,i),e.id,e.name,e.measure,e.bodyweight,e.muscle_group,e.equipment,e.instructions,0,3,'8');
  insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,source_program_id,source_program_revision,finished_at) values(pg_temp.fid(6,i),w,pg_temp.fid(4,i),card,pg_temp.fid(2,i),1,now());
  insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,skipped)
   values(pg_temp.fid(7,i),w,pg_temp.fid(6,i),e.id,e.name,e.measure,e.bodyweight,e.muscle_group,e.equipment,e.instructions,0,3,true);
  insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,replaced_from_id)
   values(pg_temp.fid(8,i),w,pg_temp.fid(6,i),e.id,e.name,e.measure,e.bodyweight,e.muscle_group,e.equipment,e.instructions,1,3,pg_temp.fid(7,i));
  insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,author_user_id,device_id,deleted_at) values(pg_temp.fid(9,i),w,pg_temp.fid(6,i),pg_temp.fid(8,i),0,8,actor,pg_temp.fid(30,i),now());
  insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id) values(pg_temp.fid(10,i),w,pg_temp.fid(6,i),'Shared retained note',actor,pg_temp.fid(30,i));
  insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id) values(pg_temp.fid(11,i),w,pg_temp.fid(6,i),'Private retained note',actor,pg_temp.fid(30,i));
  insert into public.private_notes(id,workspace_id,client_record_id,text,author_user_id,device_id) values(pg_temp.fid(12,i),w,card,'Private card note',actor,pg_temp.fid(30,i));
  insert into public.workout_sync_conflicts(workspace_id,workout_instance_id,entity_id,kind,current_version,incoming_operation,expected_revision) values(w,pg_temp.fid(6,i),pg_temp.fid(9,i),'upsert_set','{}','{}',1);
  insert into public.workout_correction_drafts(id,workspace_id,workout_instance_id,operation) values(pg_temp.fid(13,i),w,pg_temp.fid(6,i),'{}');
  insert into private.workout_correction_receipts(request_id,user_id,workspace_id,workout_id,draft_id,request,result) values(pg_temp.fid(14,i),actor,w,pg_temp.fid(6,i),pg_temp.fid(13,i),'{}','{}');
  insert into private.workout_correction_audit(request_id,user_id,workspace_id,workout_id,draft_id,operation,before_version,after_version) values(pg_temp.fid(14,i),actor,w,pg_temp.fid(6,i),pg_temp.fid(13,i),'{}','{}','{}');
  update public.workout_correction_drafts set applied_at=now(),applied_request_id=pg_temp.fid(14,i) where id=pg_temp.fid(13,i);
  update public.workout_instances set last_correction_request_id=pg_temp.fid(14,i) where id=pg_temp.fid(6,i);
  insert into public.sync_operations(operation_id,workspace_id,user_id,device_id,kind,entity_id,base_revision,result,envelope) values(pg_temp.fid(15,i),w,actor,pg_temp.fid(30,i),'upsert_set',pg_temp.fid(9,i),1,'{}','{}');
  insert into public.attendance_records(id,workspace_id,client_record_id,booking_id,service_date,status) values(pg_temp.fid(16,i),w,card,pg_temp.fid(4,i),'2026-11-01','present');
  insert into public.attendance_revisions(workspace_id,client_record_id,attendance_id,revision,cycle,status,service_date,created_by) values(w,card,pg_temp.fid(16,i),1,1,'present','2026-11-01',actor);
  insert into public.credit_entries(workspace_id,client_record_id,purchase_id,kind,units,created_by) values(w,card,case when i=0 then 'ad000000-0000-4000-8000-000000000030'::uuid else 'ad000000-0000-4000-8000-000000000031'::uuid end,'grant',10,actor);
  insert into public.credit_entries(id,workspace_id,client_record_id,purchase_id,attendance_id,booking_id,cycle,kind,units,created_by) values(pg_temp.fid(17,i),w,card,case when i=0 then 'ad000000-0000-4000-8000-000000000030'::uuid else 'ad000000-0000-4000-8000-000000000031'::uuid end,pg_temp.fid(16,i),pg_temp.fid(4,i),1,'consume',-1,actor);
  insert into public.credit_entries(workspace_id,client_record_id,purchase_id,attendance_id,booking_id,cycle,kind,units,reverses_entry_id,created_by) values(w,card,case when i=0 then 'ad000000-0000-4000-8000-000000000030'::uuid else 'ad000000-0000-4000-8000-000000000031'::uuid end,pg_temp.fid(16,i),pg_temp.fid(4,i),1,'restore',1,pg_temp.fid(17,i),actor);
  insert into public.invitations(client_record_id,token_hash,expires_at,accepted_by,accepted_at) values(card,'deletion-fixture-'||i,now()+interval '1 day',actor,now());
  foreach t in array array['booking_reschedule_receipts','client_creation_receipts'] loop
   execute format('insert into private.%I(workspace_id,actor_user_id,request_id,payload,result) values($1,$2,gen_random_uuid(),''{}'',''{}'')',t) using w,actor;
  end loop;
  foreach t in array array['booking_creation_receipts','program_assignment_receipts'] loop
   execute format('insert into private.%I(workspace_id,request_id,payload,result) values($1,gen_random_uuid(),''{}'',''{}'')',t) using w;
  end loop;
  insert into private.template_command_receipts(workspace_id,request_id,command,payload,result) values(w,gen_random_uuid(),'archive','{}','{}');
  insert into private.booking_status_command_receipts(workspace_id,actor_user_id,request_id,command,payload,result) values(w,actor,gen_random_uuid(),'confirm','{}','{}');
  insert into private.booking_command_abandonments(workspace_id,actor_user_id,command_family,request_id,booking_id,payload) values(w,actor,'status',gen_random_uuid(),pg_temp.fid(4,i),'{}');
  insert into private.client_invitation_receipts(workspace_id,actor_user_id,request_id,command,payload,invitation_id,expires_at) values(w,actor,gen_random_uuid(),'revoke','{}',gen_random_uuid(),now());
  insert into private.workout_preparation_receipts(request_id,user_id,workspace_id,booking_id,requested_workout_id,result) values(gen_random_uuid(),actor,w,pg_temp.fid(4,i),pg_temp.fid(6,i),'{}');
 end loop;
 insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at) values(pg_temp.fid(50,0),'ad000000-0000-4000-8000-000000000010','ad000000-0000-4000-8000-000000000020','2026-12-01 12:00Z','2026-12-01 13:00Z');
 insert into public.workout_instances(id,workspace_id,booking_id,client_record_id) values(pg_temp.fid(51,0),'ad000000-0000-4000-8000-000000000010',pg_temp.fid(50,0),'ad000000-0000-4000-8000-000000000020');
 insert into public.workout_correction_drafts(id,workspace_id,workout_instance_id,operation) values(pg_temp.fid(52,0),'ad000000-0000-4000-8000-000000000010',pg_temp.fid(6,0),'{}');
 update public.client_records set archived_at=now() where id='ad000000-0000-4000-8000-000000000020';
 update public.exercises set archived_at=now() where workspace_id='ad000000-0000-4000-8000-000000000010' and source_key='e0';
 insert into private.push_installations(device_id,device_secret_hash,sequence) values(pg_temp.fid(40,0),repeat('e',64),1);
 insert into private.push_devices(device_id,user_id,session_id,device_secret_hash,token,platform,generation) values(pg_temp.fid(40,0),actor,gen_random_uuid(),repeat('e',64),'ExpoPushToken[syntheticdeletiontoken]','ios',gen_random_uuid());
 insert into private.push_deliveries(notification_id,device_id,device_generation) select id,pg_temp.fid(40,0),gen_random_uuid() from public.notifications where recipient_user_id=actor;
end; $$;
-- Snapshot every trainer business table in B, including private correction audit.
create temporary table foreign_business_snapshot(name text primary key,value jsonb);
do $$ declare t record; v jsonb; begin
 for t in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attname='workspace_id' and not a.attisdropped
 where n.nspname in ('public','private') and c.relkind='r' and c.relname in
 ('client_programs','client_program_exercises','workout_templates','template_exercises','booking_programs','booking_program_exercises','workout_instances','workout_exercises','set_results','session_notes','private_notes','workout_correction_drafts','workout_sync_conflicts','sync_operations','workout_correction_receipts','workout_correction_audit','attendance_records','attendance_revisions','credit_entries','client_purchases','payment_entries') loop
  execute format('select coalesce(jsonb_agg(v order by v::text),''[]''::jsonb) from (select to_jsonb(t)-ARRAY[''created_by'',''author_user_id'',''user_id'',''revision'',''updated_at''] v from %s t where workspace_id=$1) x',t.oid::regclass) into v using 'ad000000-0000-4000-8000-000000000011'::uuid;
  insert into foreign_business_snapshot values(t.oid::regclass::text,v);
 end loop;
end; $$;

create temporary table preserved as select id,to_jsonb(p)-'created_by' value from public.payment_entries p where workspace_id='ad000000-0000-4000-8000-000000000011';

select ok(not has_function_privilege('authenticated','public.account_deletion_prepare(uuid,uuid,text)','execute'),'authenticated cannot invoke privileged deletion');
select ok(not has_function_privilege('anon','public.account_deletion_status(uuid,text)','execute'),'anonymous cannot inspect recovery');
select ok(not has_table_privilege('service_role','private.account_deletion_context','insert'),'service cannot forge immutable exception');
select ok(has_function_privilege('service_role','public.account_deletion_execute(uuid,text)','execute'),'service can execute authenticated boundary');
select ok(position('account_deletion_requires_read_committed' in pg_get_functiondef('private.account_deletion_write_lock()'::regprocedure))>0,'ordinary writer guard rejects stale transaction isolation');
select ok(position('account_deletion_requires_read_committed' in pg_get_functiondef('public.account_deletion_prepare(uuid,uuid,text)'::regprocedure))>0 and position('account_deletion_requires_read_committed' in pg_get_functiondef('public.account_deletion_execute(uuid,text)'::regprocedure))>0 and position('account_deletion_requires_read_committed' in pg_get_functiondef('public.account_deletion_complete(uuid,text)'::regprocedure))>0,'all lifecycle mutation stages enforce READ COMMITTED');
select is(public.account_deletion_status('ad000000-0000-4000-8000-000000000070',repeat('a',64)),null::jsonb,'new request has no receipt');
select is(public.account_deletion_inspect('ad000000-0000-4000-8000-000000000001')->>'foreign_client_card_count','1','dual role derives foreign connections');
select throws_ok($$delete from public.payment_entries where id='ad000000-0000-4000-8000-000000000041'$$,'55000','Billing history is immutable','ordinary deletion retains immutable history');
select throws_ok($$select public.account_deletion_prepare(gen_random_uuid(),'ad000000-0000-4000-8000-000000000099',repeat('a',64))$$,'42501','account_deletion_unavailable','unknown actor refused');
select is(public.account_deletion_prepare('ad000000-0000-4000-8000-000000000070','ad000000-0000-4000-8000-000000000001',repeat('a',64))->>'status','prepared','durable prepare fences before cleanup');
select is(public.account_deletion_prepare('ad000000-0000-4000-8000-000000000070','ad000000-0000-4000-8000-000000000001',repeat('a',64))->>'status','prepared','exact prepare replay');
select throws_ok($$select public.account_deletion_prepare('ad000000-0000-4000-8000-000000000070','ad000000-0000-4000-8000-000000000002',repeat('a',64))$$,'42501','account_deletion_unavailable','request cannot target another account');
select is(public.account_deletion_status('ad000000-0000-4000-8000-000000000070',repeat('b',64)),null::jsonb,'wrong capability status indistinguishable from absent receipt');
select throws_ok($$select public.account_deletion_execute('ad000000-0000-4000-8000-000000000070',repeat('b',64))$$,'42501','account_deletion_unavailable','wrong capability cannot mutate');
select throws_ok($$insert into public.client_records(workspace_id,display_name) values('ad000000-0000-4000-8000-000000000010','Late')$$,'55000','account_deletion_in_progress','service writes to deleting workspace fenced');
select throws_ok($$update public.client_records set display_name='Late' where id='ad000000-0000-4000-8000-000000000021'$$,'55000','account_deletion_in_progress','new references to deleting account fenced');
select lives_ok($$insert into public.client_records(workspace_id,display_name) values('ad000000-0000-4000-8000-000000000011','Unrelated')$$,'foreign unrelated owner can continue writing');
select is(public.account_deletion_execute('ad000000-0000-4000-8000-000000000070',repeat('a',64))->>'status','database_deleted','transaction removes own workspace and detaches dual role');
-- Every own scoped table must be empty, not just parent/card rows.
create function pg_temp.own_rows() returns bigint language plpgsql as $$
declare t record; n bigint; total bigint:=0; begin
 for t in select c.oid from pg_class c join pg_namespace ns on ns.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attname='workspace_id' and not a.attisdropped where ns.nspname in ('public','private') and c.relkind='r' loop
  execute format('select count(*) from %s where workspace_id=$1',t.oid::regclass) into n using 'ad000000-0000-4000-8000-000000000010'::uuid; total:=total+n;
 end loop; return total; end; $$;
select is(pg_temp.own_rows(),0::bigint,'full owned FK graph removed across every scoped table');
create function pg_temp.foreign_business_unchanged() returns boolean language plpgsql as $$
declare t record; v jsonb; begin
 for t in select * from foreign_business_snapshot loop
  execute format('select coalesce(jsonb_agg(v order by v::text),''[]''::jsonb) from (select to_jsonb(x)-ARRAY[''created_by'',''author_user_id'',''user_id'',''revision'',''updated_at''] v from %s x where workspace_id=$1) y',t.name::regclass) into v using 'ad000000-0000-4000-8000-000000000011'::uuid;
  if v is distinct from t.value then return false; end if;
 end loop; return true; end; $$;
select ok(pg_temp.foreign_business_unchanged(),'all foreign programs, snapshots, journals, finance, and correction history exact');
select is((select count(*) from private.push_devices where user_id='ad000000-0000-4000-8000-000000000001'),0::bigint,'account push devices removed');
select is((select count(*) from public.notifications where recipient_user_id='ad000000-0000-4000-8000-000000000001'),0::bigint,'account notifications removed');
select is((select count(*) from public.trainer_workspaces where id='ad000000-0000-4000-8000-000000000010'),0::bigint,'own workspace removed');
select is((select count(*) from private.billing_command_receipts where workspace_id='ad000000-0000-4000-8000-000000000010'),0::bigint,'immutable private receipts removed');
select is((select count(*) from public.payment_entries where workspace_id='ad000000-0000-4000-8000-000000000010'),0::bigint,'self reversal chain removed');
select is((select count(*) from public.client_records where id='ad000000-0000-4000-8000-000000000021' and user_id is null),1::bigint,'foreign dual-role card retained without app');
select is((select to_jsonb(p)-'created_by' from public.payment_entries p where id='ad000000-0000-4000-8000-000000000041'),(select value from preserved),'foreign payment business history exact');
select is((select count(*) from public.payment_entries where id='ad000000-0000-4000-8000-000000000041' and created_by is null),1::bigint,'foreign immutable audit identity anonymized');
select is((select count(*) from public.workout_instances where id='ad000000-0000-4000-8000-000000000060'),1::bigint,'foreign finished journal retained');
select is((select count(*) from public.schedule_proposals where booking_id='ad000000-0000-4000-8000-000000000050' and author_user_id is null),1::bigint,'foreign proposal retains history without Auth blocker');
select is((select count(*) from auth.users where id='ad000000-0000-4000-8000-000000000003'),1::bigint,'owned workspace cleanup never deletes client Auth');
select is((select count(*) from private.account_deletion_context),0::bigint,'exception removed after transaction work');
select throws_ok($$select public.account_deletion_complete('ad000000-0000-4000-8000-000000000070',repeat('a',64))$$,'55000','account_deletion_auth_pending','Auth-present partial failure cannot complete');
select is(public.account_deletion_execute('ad000000-0000-4000-8000-000000000070',repeat('a',64))->>'status','database_deleted','DB retry does not repeat cleanup');
select throws_ok($$update public.payment_entries set amount_minor=101 where id='ad000000-0000-4000-8000-000000000041'$$,'55000','Billing history is immutable','immutable protection remains after cleanup');
select lives_ok($$delete from auth.users where id='ad000000-0000-4000-8000-000000000001'$$,'Auth deletion has no remaining application FK');
select is(public.account_deletion_status('ad000000-0000-4000-8000-000000000070',repeat('a',64))->>'status','database_deleted','receipt recoverable after lost Auth response');
select is(public.account_deletion_complete('ad000000-0000-4000-8000-000000000070',repeat('a',64))->>'status','complete','completion after Auth deletion');
select is(public.account_deletion_complete('ad000000-0000-4000-8000-000000000070',repeat('a',64))->>'status','complete','completion exact replay');
select is(public.account_deletion_prepare('ad000000-0000-4000-8000-000000000071','ad000000-0000-4000-8000-000000000003',repeat('c',64))->>'status','prepared','client-only prepare');
select is(public.account_deletion_execute('ad000000-0000-4000-8000-000000000071',repeat('c',64))->>'status','database_deleted','client-only cleanup');
select is((select count(*) from public.client_records where id='ad000000-0000-4000-8000-000000000022' and user_id is null),1::bigint,'client-only foreign card retained');
select is((select count(*) from public.client_purchases where id='ad000000-0000-4000-8000-000000000032'),1::bigint,'client-only purchase retained');
select lives_ok($$delete from auth.users where id='ad000000-0000-4000-8000-000000000003'$$,'client-only Auth deletion succeeds');
select is(public.account_deletion_complete('ad000000-0000-4000-8000-000000000071',repeat('c',64))->>'status','complete','client-only complete');
select ok(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and c.relname not like 'account_deletion_%' and not exists(select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='account_deletion_lock')),'statement lock covers every application table');
select * from finish();
rollback;
