begin;

create table private.program_update_receipts (
 request_id uuid primary key,
 workspace_id uuid not null references public.trainer_workspaces(id),
 request jsonb not null,
 result jsonb not null,
 provenance jsonb not null,
 created_at timestamptz not null default now()
);
alter table private.program_update_receipts enable row level security;
revoke all on private.program_update_receipts from public, anon, authenticated;
create trigger program_update_receipts_immutable before update or delete on private.program_update_receipts
 for each row execute function private.reject_correction_record_mutation();

create function private.stamp_client_program_created_at() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 new.created_at:=greatest(new.created_at,clock_timestamp(),(select max(p.created_at)+interval '1 microsecond' from public.client_programs p where p.workspace_id=new.workspace_id and p.client_record_id=new.client_record_id));
 return new;
end; $$;
revoke all on function private.stamp_client_program_created_at() from public,anon,authenticated;
create trigger client_programs_stamp_created_at before insert on public.client_programs for each row execute function private.stamp_client_program_created_at();

create function private.program_update_context(p_actor_id uuid,p_workspace_id uuid,p_workout_id uuid,p_client_record_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare w public.workout_instances; p public.client_programs; b public.booking_programs; source_id uuid; source_rev integer; source_name text; source_kind text; e public.workout_exercises; root public.workout_exercises;
 target public.client_program_exercises; last_set public.set_results; options jsonb:='[]'::jsonb; item jsonb; kind text; recorded integer;
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id or not public.is_workspace_owner(p_workspace_id) then
 raise exception 'scope_unavailable' using errcode='42501'; end if;
 perform 1 from public.client_records where workspace_id=p_workspace_id and id=p_client_record_id and archived_at is null;
 if not found then raise exception 'client_unavailable' using errcode='P0002'; end if;
 select * into w from public.workout_instances where workspace_id=p_workspace_id and id=p_workout_id and client_record_id=p_client_record_id;
 if not found or w.finished_at is null then raise exception 'journal_unavailable' using errcode='P0002'; end if;
 select * into p from public.client_programs where workspace_id=p_workspace_id and client_record_id=p_client_record_id order by created_at desc,id desc limit 1;
 select * into b from public.booking_programs where workspace_id=p_workspace_id and booking_id=w.booking_id;
 if w.source_program_id is not null then
 if p.id is distinct from w.source_program_id and not exists(select 1 from private.program_update_receipts r where r.workspace_id=p_workspace_id and r.result->>'program_id'=p.id::text and r.provenance->>'workout_id'=w.id::text) then
 raise exception 'assignment_changed' using errcode='40001'; end if;
 if p.id=w.source_program_id and p.revision is distinct from w.source_program_revision then raise exception 'source_changed' using errcode='40001'; end if;
 elsif b.id is null then raise exception 'source_unavailable' using errcode='P0002';
 elsif p.id is not null and not exists(select 1 from private.program_update_receipts r where r.workspace_id=p_workspace_id and r.result->>'program_id'=p.id::text and r.provenance->>'workout_id'=w.id::text) then
 if p.base_template_id is distinct from b.base_template_id or p.base_template_revision is distinct from b.base_template_revision or
 (select jsonb_agg(jsonb_build_array(exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note) order by position) from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=p.id) is distinct from
 (select jsonb_agg(jsonb_build_array(exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note) order by position) from public.booking_program_exercises where workspace_id=p_workspace_id and booking_program_id=b.id) then
 raise exception 'assignment_changed' using errcode='40001'; end if;
 end if;
 source_id:=coalesce(p.id,b.id);source_rev:=coalesce(p.revision,1);source_name:=coalesce(p.name,b.name);source_kind:=case when p.id is null then 'booking' else 'personal' end;
 for e in select * from public.workout_exercises where workspace_id=p_workspace_id and workout_instance_id=w.id order by position,id loop
 if exists(select 1 from public.workout_exercises x where x.workspace_id=p_workspace_id and x.workout_instance_id=w.id and x.replaced_from_id=e.id and (e.skipped or not x.skipped)) then continue; end if;
 root:=e;
 for i in 1..50 loop
 exit when root.replaced_from_id is null;
 select * into root from public.workout_exercises where workspace_id=p_workspace_id and workout_instance_id=w.id and id=root.replaced_from_id;
 if not found then raise exception 'invalid_chain' using errcode='22023'; end if;
 if i=50 then raise exception 'invalid_chain' using errcode='22023'; end if;
 end loop;
 if source_kind='personal' then
 select * into target from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=p.id and exercise_id=e.exercise_id;
 if not found then select * into target from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=p.id and exercise_id=root.exercise_id; end if;
 else
 select (jsonb_populate_record(null::public.client_program_exercises,to_jsonb(x))).* into target from public.booking_program_exercises x where x.workspace_id=p_workspace_id and x.booking_program_id=b.id and x.exercise_id=e.exercise_id;
 if not found then select (jsonb_populate_record(null::public.client_program_exercises,to_jsonb(x))).* into target from public.booking_program_exercises x where x.workspace_id=p_workspace_id and x.booking_program_id=b.id and x.exercise_id=root.exercise_id; end if;
 end if;
 select coalesce(max(position)+1,0) into recorded from public.set_results where workspace_id=p_workspace_id and workout_exercise_id=e.id and deleted_at is null and weight_g is not null and ((e.measure_snapshot='reps' and reps>0) or (e.measure_snapshot='seconds' and seconds>0));
 select * into last_set from public.set_results where workspace_id=p_workspace_id and workout_exercise_id=e.id and deleted_at is null and weight_g is not null and ((e.measure_snapshot='reps' and reps>0) or (e.measure_snapshot='seconds' and seconds>0)) order by position desc,id desc limit 1;
 item:=jsonb_build_object('exercise_id',e.id,'name',e.exercise_name_snapshot,'planned_sets',e.planned_sets,'old_name',target.exercise_name_snapshot,'target_exercise_id',target.exercise_id,'snapshot',to_jsonb(e),
 'plan',jsonb_build_object('sets',target.planned_sets,'reps',target.planned_reps,'seconds',target.planned_seconds,'weight_g',target.planned_weight_g),
 'fact',jsonb_build_object('sets',recorded,'reps',last_set.reps,'seconds',last_set.seconds,'weight_g',last_set.weight_g));
 if e.skipped then
 if target.id is not null then options:=options||jsonb_build_array(item||jsonb_build_object('key','skip:'||e.id,'kind','skip','checked',false)); end if;
 continue;
 end if;
 if target.id is null or target.exercise_id<>e.exercise_id then
 kind:=case when target.id is null then 'add' else 'replace' end;
 if last_set.id is null then continue; end if;
 options:=options||jsonb_build_array(item||jsonb_build_object('key',kind||':'||e.id,'kind',kind,'checked',true));
 else
 if last_set.id is not null and (target.planned_weight_g is distinct from last_set.weight_g or target.planned_reps is distinct from last_set.reps::text or target.planned_seconds is distinct from last_set.seconds::text) then
 options:=options||jsonb_build_array(item||jsonb_build_object('key','values:'||e.id,'kind','values','checked',false)); end if;
 end if;
 if target.id is not null and recorded>target.planned_sets then
 options:=options||jsonb_build_array(item||jsonb_build_object('key','sets:'||e.id,'kind','sets','checked',false)); end if;
 end loop;
 return jsonb_build_object('account_id',p_actor_id,'workspace_id',p_workspace_id,'client_record_id',p_client_record_id,'workout_id',w.id,
 'source_kind',source_kind,'booking_program_id',b.id,'booking_template_revision',b.base_template_revision,'journal_source_program_id',w.source_program_id,'journal_source_program_revision',w.source_program_revision,'workout_revision',w.revision,'program_id',source_id,'program_revision',source_rev,'program_name',source_name,'options',options);
end; $$;
revoke all on function private.program_update_context(uuid,uuid,uuid,uuid) from public,anon,authenticated;

create function public.get_program_update(p_actor_id uuid,p_workspace_id uuid,p_workout_id uuid,p_client_record_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is distinct from p_actor_id or not public.is_workspace_owner(p_workspace_id) then raise exception 'scope_unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,29));
 perform 1 from public.trainer_workspaces where id=p_workspace_id for update;
 return private.program_update_context(p_actor_id,p_workspace_id,p_workout_id,p_client_record_id);
end; $$;

create function public.update_client_program(p_actor_id uuid,p_workspace_id uuid,p_client_record_id uuid,p_workout_id uuid,
 p_program_id uuid,p_expected_program_revision integer,p_expected_workout_revision integer,p_selected_keys text[],p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare req jsonb; r private.program_update_receipts; context jsonb; option jsonb; source public.client_programs;
 copy_id uuid:=gen_random_uuid(); e public.workout_exercises; fact jsonb; k text; target_id uuid; result jsonb; n integer;
begin
 if auth.uid() is null or auth.uid() is distinct from p_actor_id or not public.is_workspace_owner(p_workspace_id) then raise exception 'scope_unavailable' using errcode='42501'; end if;
 if p_request_id is null or p_program_id is null or p_workout_id is null or p_client_record_id is null or p_expected_program_revision is null or p_expected_program_revision<1 or p_expected_workout_revision is null or p_expected_workout_revision<1
 or p_selected_keys is null or array_ndims(p_selected_keys) is distinct from 1 or array_lower(p_selected_keys,1) is distinct from 1 or cardinality(p_selected_keys) not between 1 and 100 or exists(select 1 from unnest(p_selected_keys) x where x is null)
 or (select count(distinct x) from unnest(p_selected_keys) x)<>cardinality(p_selected_keys) then raise exception 'invalid_request' using errcode='22023'; end if;
 req:=jsonb_build_object('actor_id',p_actor_id,'workspace_id',p_workspace_id,'client_record_id',p_client_record_id,'workout_id',p_workout_id,'program_id',p_program_id,
 'program_revision',p_expected_program_revision,'workout_revision',p_expected_workout_revision,'selected_keys',to_jsonb(p_selected_keys),'request_id',p_request_id);
 -- Correction/sync advisory lock first; assignment workspace row second. Assignment never waits on the advisory lock.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,29));
 perform 1 from public.trainer_workspaces where id=p_workspace_id for update;
 perform pg_advisory_xact_lock(hashtextextended('program-update:'||p_request_id::text,29));
 select * into r from private.program_update_receipts where request_id=p_request_id;
 if found then if r.request is distinct from req then raise exception 'request_id_reused' using errcode='22023'; end if; return r.result; end if;
 perform 1 from public.client_records where workspace_id=p_workspace_id and id=p_client_record_id for update;
 context:=private.program_update_context(p_actor_id,p_workspace_id,p_workout_id,p_client_record_id);
 if context->>'program_id' is distinct from p_program_id::text or (context->>'program_revision')::integer<>p_expected_program_revision or (context->>'workout_revision')::integer<>p_expected_workout_revision then raise exception 'stale_source' using errcode='40001'; end if;
 if exists(select 1 from unnest(p_selected_keys) x where not exists(select 1 from jsonb_array_elements(context->'options') o where o->>'key'=x)) then raise exception 'invalid_selection' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(context->'options') o where o->>'key'=any(p_selected_keys) and o->>'kind'='skip' and exists(select 1 from unnest(p_selected_keys) x where x<>o->>'key' and split_part(x,':',2)=o->>'exercise_id')) then raise exception 'invalid_selection' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(context->'options') o where o->>'key'=any(p_selected_keys) group by o->'snapshot'->>'exercise_id' having count(distinct o->>'exercise_id')>1) then raise exception 'duplicate_exercise' using errcode='22023'; end if;
 if context->>'source_kind'='personal' then select * into source from public.client_programs where workspace_id=p_workspace_id and id=p_program_id;
 else select (jsonb_populate_record(null::public.client_programs,to_jsonb(x))).* into source from public.booking_programs x where x.workspace_id=p_workspace_id and x.id=p_program_id; end if;
 insert into public.client_programs(id,workspace_id,client_record_id,base_template_id,base_template_revision,name,description,created_by,created_at)
 values(copy_id,p_workspace_id,p_client_record_id,source.base_template_id,source.base_template_revision,source.name,source.description,p_actor_id,
 greatest(clock_timestamp(),source.created_at+interval '1 microsecond'));
 if context->>'source_kind'='personal' then
 insert into public.client_program_exercises(workspace_id,client_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,created_by)
 select workspace_id,copy_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,p_actor_id
 from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=p_program_id order by position;
 else
 insert into public.client_program_exercises(workspace_id,client_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,created_by)
 select workspace_id,copy_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,p_actor_id
 from public.booking_program_exercises where workspace_id=p_workspace_id and booking_program_id=p_program_id order by position;
 end if;
 for option in select o from jsonb_array_elements(context->'options') o where o->>'key'=any(p_selected_keys) loop
 k:=option->>'kind'; fact:=option->'fact'; target_id:=(option->>'target_exercise_id')::uuid;
 select * into e from public.workout_exercises where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=(option->>'exercise_id')::uuid;
 if k='skip' then delete from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id and exercise_id=target_id;
 update public.client_program_exercises t set position=q.pos from (select id,(row_number() over(order by position,id)-1)::integer pos from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id) q where t.id=q.id and t.position is distinct from q.pos;
 elsif k='sets' then
 if target_id is distinct from e.exercise_id and not ('replace:'||e.id=any(p_selected_keys)) then raise exception 'replacement_required' using errcode='22023'; end if;
 update public.client_program_exercises set planned_sets=(fact->>'sets')::integer where workspace_id=p_workspace_id and client_program_id=copy_id and exercise_id=e.exercise_id;
 elsif k='values' then
 update public.client_program_exercises set planned_reps=fact->>'reps',planned_seconds=fact->>'seconds',planned_weight_g=(fact->>'weight_g')::integer where workspace_id=p_workspace_id and client_program_id=copy_id and exercise_id=e.exercise_id;
 else
 if k='replace' then select position into n from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id and exercise_id=target_id;
 delete from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id and exercise_id=target_id;
 else select coalesce(max(position)+1,0) into n from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id; end if;
 insert into public.client_program_exercises(workspace_id,client_program_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,planned_reps,planned_seconds,planned_weight_g,rest_seconds,note,created_by)
 values(p_workspace_id,copy_id,e.exercise_id,e.exercise_name_snapshot,e.measure_snapshot,e.bodyweight_snapshot,e.muscle_group_snapshot,e.equipment_snapshot,e.instructions_snapshot,e.source_key_snapshot,n,
 case when k='replace' then (option->'plan'->>'sets')::integer else e.planned_sets end,fact->>'reps',fact->>'seconds',(fact->>'weight_g')::integer,e.rest_seconds,e.note,p_actor_id);
 end if;
 end loop;
 update public.client_program_exercises t set position=q.pos from (select id,(row_number() over(order by position,id)-1)::integer pos from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id) q where t.id=q.id and t.position is distinct from q.pos;
 select count(*) into n from public.client_program_exercises where workspace_id=p_workspace_id and client_program_id=copy_id;
 if n not between 1 and 50 then raise exception 'invalid_program_size' using errcode='22023'; end if;
 result:=jsonb_build_object('account_id',p_actor_id,'workspace_id',p_workspace_id,'client_record_id',p_client_record_id,'workout_id',p_workout_id,'request_id',p_request_id,'program_id',copy_id,'revision',1,'status','applied');
 insert into private.program_update_receipts(request_id,workspace_id,request,result,provenance) values(p_request_id,p_workspace_id,req,result,
 context||jsonb_build_object('selected_keys',to_jsonb(p_selected_keys),'selected_exercises',(select jsonb_agg(o) from jsonb_array_elements(context->'options') o where o->>'key'=any(p_selected_keys))));
 return result;
end; $$;
revoke all on function public.get_program_update(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.get_program_update(uuid,uuid,uuid,uuid) to authenticated;
revoke all on function public.update_client_program(uuid,uuid,uuid,uuid,uuid,integer,integer,text[],uuid) from public,anon;
grant execute on function public.update_client_program(uuid,uuid,uuid,uuid,uuid,integer,integer,text[],uuid) to authenticated;
commit;
