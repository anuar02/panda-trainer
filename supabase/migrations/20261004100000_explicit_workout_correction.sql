begin;
alter table public.workout_instances add column last_correction_request_id uuid;
alter table public.workout_exercises add column last_correction_request_id uuid;
create function private.apply_correction_operation(p_workspace_id uuid, o jsonb, force_version boolean default false, p_request_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 k text := o->>'kind'; p jsonb := o->'payload'; eid uuid := (o->>'entity_id')::uuid;
 base integer := (o->>'base_revision')::integer; dev uuid := (o->>'device_id')::uuid;
 wid uuid; wi public.workout_instances; ex public.workout_exercises; sr public.set_results;
 lib public.exercises; note jsonb; current_value jsonb; rev integer;
 allowed text[]; cf public.workout_sync_conflicts; result jsonb; oldid uuid; note_shared boolean;
begin
 if k in ('create_workout','finish_workout') then raise exception 'unsupported_correction' using errcode='22023'; end if;
 allowed := case k
 when 'add_exercise' then array['workout_instance_id','exercise_id','position','planned_sets']
 when 'replace_exercise' then array['workout_instance_id','replaced_from_id','exercise_id','position','planned_sets']
 when 'upsert_set' then array['workout_instance_id','workout_exercise_id','position','reps','seconds','weight_g']
 when 'delete_set' then array['workout_instance_id','workout_exercise_id']
 when 'set_note' then array['workout_instance_id','text','shared']
 when 'resolve_conflict' then array['conflict_id','selected_version','expected_revision'] else null end;
 if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])
 or exists(select 1 from jsonb_object_keys(o) a where not(a=any(array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])))
 or jsonb_typeof(o->'base_revision') is distinct from 'number' or coalesce(o->>'base_revision','')!~'^[0-9]+$'
 or eid is null or dev is null or (o->>'operation_id')::uuid is null or (o->>'created_at')::timestamptz is null then raise exception 'invalid_envelope' using errcode='22023'; end if;
 if allowed is null or jsonb_typeof(p) is distinct from 'object' or not (p ?& allowed)
 or exists(select 1 from jsonb_object_keys(p) a where not(a=any(allowed))) then
 raise exception 'invalid_payload' using errcode='22023'; end if;
 if k in ('add_exercise','replace_exercise','upsert_set') and (jsonb_typeof(p->'position') is distinct from 'number' or coalesce(p->>'position','')!~'^[0-9]+$') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if k in ('add_exercise','replace_exercise') and (jsonb_typeof(p->'planned_sets') is distinct from 'number' or coalesce(p->>'planned_sets','')!~'^[0-9]+$') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if k='upsert_set' and exists(select 1 from jsonb_each(p) a where a.key in ('reps','seconds','weight_g') and a.value<>'null'::jsonb and (jsonb_typeof(a.value)<>'number' or a.value::text!~'^[0-9]+$')) then raise exception 'invalid_payload' using errcode='22023'; end if;
 if k='resolve_conflict' then
 if jsonb_typeof(p->'selected_version') is distinct from 'string' or coalesce(p->>'selected_version','') not in ('current','incoming') or jsonb_typeof(p->'expected_revision') is distinct from 'number' or coalesce(p->>'expected_revision','') !~ '^[1-9][0-9]*$' or (p->>'conflict_id')::uuid is null then raise exception 'invalid_payload' using errcode='22023'; end if;
 select * into cf from public.workout_sync_conflicts where id=(p->>'conflict_id')::uuid and workspace_id=p_workspace_id for update;
 if not found or cf.entity_id<>eid or cf.resolved_at is not null or (p->>'expected_revision')::integer<>cf.expected_revision
 or base<>(p->>'expected_revision')::integer or p->>'selected_version' not in ('current','incoming') then raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.kind not in ('upsert_set','delete_set','replace_exercise','set_note','add_exercise') then raise exception 'unsupported_correction' using errcode='22023'; end if;
 if not exists(select 1 from public.sync_operations r where r.operation_id=(cf.incoming_operation->>'operation_id')::uuid
 and r.workspace_id=p_workspace_id and r.user_id=auth.uid() and r.envelope=cf.incoming_operation
 and r.result->>'status'='conflict' and r.result->>'conflict_id'=cf.id::text) then raise exception 'invalid_provenance' using errcode='22023'; end if;
 if jsonb_typeof(cf.incoming_operation) is distinct from 'object'
 or not(cf.incoming_operation ?& array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])
 or exists(select 1 from jsonb_object_keys(cf.incoming_operation) a where not(a=any(array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])))
 or cf.incoming_operation->>'kind' is distinct from cf.kind or (cf.incoming_operation->>'entity_id')::uuid is distinct from eid
 or (cf.incoming_operation->'payload'->>'workout_instance_id')::uuid is distinct from cf.workout_instance_id
 or (cf.incoming_operation->>'device_id')::uuid is null or (cf.incoming_operation->>'created_at')::timestamptz is null
 or jsonb_typeof(cf.incoming_operation->'base_revision') is distinct from 'number'
 or coalesce(cf.incoming_operation->>'base_revision','')!~'^[0-9]+$' then raise exception 'invalid_envelope' using errcode='22023'; end if;
 select * into wi from public.workout_instances where workspace_id=p_workspace_id and id=cf.workout_instance_id for update;
 if cf.kind in ('upsert_set','delete_set') then select revision into rev from public.set_results where workspace_id=p_workspace_id and id=eid;
 if rev is null then select revision into rev from public.workout_exercises where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid; end if;
 elsif cf.kind='set_note' then select revision into rev from public.private_notes where workspace_id=p_workspace_id and id=eid;
 elsif cf.kind='replace_exercise' then select revision into rev from public.workout_exercises where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'replaced_from_id')::uuid;
 else rev:=wi.revision; end if;
 if cf.kind in ('upsert_set','delete_set') and (
 cf.current_version->'sets' is distinct from (select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid)
 or (cf.current_version->'exercise'-'last_correction_request_id') is distinct from (select to_jsonb(e)-'last_correction_request_id' from public.workout_exercises e where e.workspace_id=p_workspace_id and e.id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid)
 ) then raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.kind='replace_exercise' and (cf.current_version-'sets'-'last_correction_request_id') is distinct from (select to_jsonb(e)-'last_correction_request_id' from public.workout_exercises e where e.workspace_id=p_workspace_id and e.id=(cf.incoming_operation->'payload'->>'replaced_from_id')::uuid) then raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.kind='set_note' and (jsonb_typeof(cf.current_version->'shared') is distinct from 'boolean' or jsonb_typeof(cf.current_version->'text') is distinct from 'string') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if cf.current_version ? 'exercise_revision' and
 (select revision from public.workout_exercises where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid) is distinct from (cf.current_version->>'exercise_revision')::integer then
 raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.current_version ? 'replacements' and (select coalesce(jsonb_agg(value-'last_correction_request_id'),'[]'::jsonb) from jsonb_array_elements(cf.current_version->'replacements')) is distinct from
 (select coalesce(jsonb_agg((to_jsonb(e)-'last_correction_request_id')||jsonb_build_object('sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=e.id)) order by e.position,e.id),'[]'::jsonb) from public.workout_exercises e where e.workspace_id=p_workspace_id and e.replaced_from_id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid) then
 raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.kind='replace_exercise' and cf.current_version->'sets' is distinct from
 (select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=(cf.incoming_operation->'payload'->>'replaced_from_id')::uuid) then
 raise exception 'stale_conflict' using errcode='22023'; end if;
 if rev is distinct from cf.expected_revision then raise exception 'stale_conflict' using errcode='22023'; end if;

 if cf.kind='set_note' then perform private.validate_correction_note_snapshot(cf.current_version,p_workspace_id,wi.id,eid); end if;
 if cf.kind='set_note' then
 -- Restore the actual chosen snapshot, including its visibility intent.
 note := case when p->>'selected_version'='current' then cf.current_version else
 jsonb_build_object('text',cf.incoming_operation->'payload'->>'text','shared',cf.incoming_operation->'payload'->'shared','author_user_id',auth.uid(),'device_id',cf.incoming_operation->>'device_id') end;
 note_shared := (note->>'shared')::boolean and not exists(select 1 from public.workout_sync_conflicts c where c.workspace_id=p_workspace_id and c.entity_id=eid and c.kind='set_note' and c.resolved_at is null and c.id<>cf.id);
 if p->>'selected_version'='current' and not note_shared and exists(select 1 from public.private_notes n
 where n.workspace_id=p_workspace_id and n.workout_instance_id=wi.id and n.id=eid and n.text=note->>'text'
 and n.author_user_id=(note->>'author_user_id')::uuid and n.device_id=(note->>'device_id')::uuid) then
 result:=jsonb_build_object('status','applied','revision',rev);
 else
 rev:=rev+1;
 delete from public.session_notes where workspace_id=p_workspace_id and id=eid;
 delete from public.private_notes where workspace_id=p_workspace_id and id=eid;
 if note_shared then
 insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wi.id,note->>'text',(note->>'author_user_id')::uuid,(note->>'device_id')::uuid,rev);
 else
 insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wi.id,note->>'text',(note->>'author_user_id')::uuid,(note->>'device_id')::uuid,rev);
 end if;
 result:=jsonb_build_object('status','applied','revision',rev);
 end if;
 elsif p->>'selected_version'='incoming' then
 result := private.apply_correction_operation(p_workspace_id,cf.incoming_operation,true,p_request_id);
 if result->>'status'<>'applied' then return result; end if;
 else
 result := jsonb_build_object('status','applied','revision',rev); end if;
 update public.workout_sync_conflicts set resolved_at=now(),selected_version=p->>'selected_version' where id=cf.id;
 if cf.kind='set_note' then
 -- Choosing one immutable version does not discard the other conflicts.
 -- Refresh their resolution token; a device holding the old token must reload.
 update public.workout_sync_conflicts set expected_revision=rev where workspace_id=p_workspace_id and entity_id=eid and kind='set_note' and resolved_at is null;
 end if;
 return result;
 end if;
 if k in ('add_exercise','replace_exercise') and exists(select 1 from public.workout_exercises where id=eid) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k in ('upsert_set','delete_set') and exists(select 1 from public.set_results where id=eid and (workspace_id<>p_workspace_id or workout_instance_id<>(p->>'workout_instance_id')::uuid or workout_exercise_id<>(p->>'workout_exercise_id')::uuid)) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k='set_note' and (exists(select 1 from public.session_notes where id=eid and (workspace_id<>p_workspace_id or workout_instance_id<>(p->>'workout_instance_id')::uuid)) or exists(select 1 from public.private_notes where id=eid and (workspace_id<>p_workspace_id or workout_instance_id is distinct from (p->>'workout_instance_id')::uuid))) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 wid := (p->>'workout_instance_id')::uuid;
 select * into wi from public.workout_instances where id=wid and workspace_id=p_workspace_id for update;
 if not found then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k in ('upsert_set','delete_set') then
 select * into ex from public.workout_exercises where id=(p->>'workout_exercise_id')::uuid and workspace_id=p_workspace_id and workout_instance_id=wid;
 if not found or (k='upsert_set' and ((ex.measure_snapshot='reps' and p->'seconds'<>'null'::jsonb) or (ex.measure_snapshot='seconds' and p->'reps'<>'null'::jsonb))) then raise exception 'invalid_payload' using errcode='22023'; end if; end if;
 if k='set_note' and (jsonb_typeof(p->'text') is distinct from 'string' or jsonb_typeof(p->'shared') is distinct from 'boolean') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if k='set_note' and base>0 and not exists(select 1 from public.session_notes where workspace_id=p_workspace_id and id=eid and workout_instance_id=wid) and not exists(select 1 from public.private_notes where workspace_id=p_workspace_id and id=eid and workout_instance_id=wid) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k in ('add_exercise','replace_exercise') then
 if not exists(select 1 from public.exercises where workspace_id=p_workspace_id and id=(p->>'exercise_id')::uuid and archived_at is null) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k='replace_exercise' and not exists(select 1 from public.workout_exercises where workspace_id=p_workspace_id and workout_instance_id=wid and id=(p->>'replaced_from_id')::uuid) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 end if;

 if k in ('add_exercise','replace_exercise') then
 if base<>0 then raise exception 'invalid_revision' using errcode='22023'; end if;
 select * into lib from public.exercises where workspace_id=p_workspace_id and id=(p->>'exercise_id')::uuid and archived_at is null;
 if not found then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k='replace_exercise' then
 oldid := (p->>'replaced_from_id')::uuid;
 select * into ex from public.workout_exercises where workspace_id=p_workspace_id and workout_instance_id=wid and id=oldid;
 if not found or ex.skipped then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if exists(select 1 from public.set_results where workspace_id=p_workspace_id and workout_exercise_id=oldid) and not force_version then
 current_value:=to_jsonb(ex)||jsonb_build_object('sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=oldid)); rev:=ex.revision;
 else update public.workout_exercises set skipped=true where id=oldid; end if;
 end if;
 if current_value is null then
 insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,source_key_snapshot,position,planned_sets,replaced_from_id,source_device_id)
 values(eid,p_workspace_id,wid,lib.id,lib.name,lib.measure,lib.bodyweight,lib.muscle_group,lib.equipment,lib.instructions,lib.source_key,
 greatest((p->>'position')::integer,coalesce((select max(position)+1 from public.workout_exercises where workout_instance_id=wid),0)),(p->>'planned_sets')::integer,oldid,dev);
 rev:=1;
 end if;
 elsif k in ('upsert_set','delete_set') then
 select * into ex from public.workout_exercises where workspace_id=p_workspace_id and workout_instance_id=wid and id=(p->>'workout_exercise_id')::uuid;
 if not found then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 select * into sr from public.set_results where id=eid and workspace_id=p_workspace_id;
 if sr.id is null and (base>0 or k='delete_set') then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if found and (sr.workout_instance_id<>wid or sr.workout_exercise_id<>ex.id) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if (coalesce(sr.revision,0)<>base or sr.deleted_at is not null or ex.skipped) and not force_version then
 current_value:=coalesce(to_jsonb(sr),to_jsonb(ex))||jsonb_build_object('exercise_revision',ex.revision,'exercise',to_jsonb(ex),'sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=ex.id),'replacements',(select coalesce(jsonb_agg((to_jsonb(e)-'last_correction_request_id')||jsonb_build_object('sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=e.id)) order by e.position,e.id),'[]'::jsonb) from public.workout_exercises e where e.workspace_id=p_workspace_id and e.replaced_from_id=ex.id)); rev:=coalesce(sr.revision,ex.revision);
 else
 if ex.skipped and force_version then
 update public.workout_exercises set skipped=false,last_correction_request_id=p_request_id where workspace_id=p_workspace_id and id=ex.id and skipped;
 update public.workout_exercises set skipped=true where workspace_id=p_workspace_id and replaced_from_id=ex.id and not skipped;
 end if;
 if k='delete_set' then
 if sr.id is null then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 update public.set_results set deleted_at=now(),device_id=dev where id=eid returning revision into rev;
 else
 insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,requested_position,reps,seconds,weight_g,author_user_id,device_id)
 values(eid,p_workspace_id,wid,ex.id,(p->>'position')::integer,(p->>'position')::integer,(p->>'reps')::integer,(p->>'seconds')::integer,(p->>'weight_g')::integer,auth.uid(),dev)
 on conflict(id) do update set reps=excluded.reps,seconds=excluded.seconds,weight_g=excluded.weight_g,device_id=dev,deleted_at=null returning revision into rev;
 update public.set_results s set position=q.pos from (select id,(row_number() over(order by coalesce(requested_position,position),device_id,id)-1)::integer pos from public.set_results where workspace_id=p_workspace_id and workout_exercise_id=ex.id) q where s.id=q.id and s.position is distinct from q.pos;
 end if;
 update public.workout_exercises set last_correction_request_id=p_request_id where workspace_id=p_workspace_id and id=ex.id and last_correction_request_id is distinct from p_request_id;
 end if;
 elsif k='set_note' then
 if jsonb_typeof(p->'text') is distinct from 'string' or jsonb_typeof(p->'shared') is distinct from 'boolean' then raise exception 'invalid_payload' using errcode='22023'; end if;
 select to_jsonb(n)||jsonb_build_object('shared',true) into note from public.session_notes n where id=eid and workspace_id=p_workspace_id and workout_instance_id=wid;
 if note is null then select to_jsonb(n)||jsonb_build_object('shared',false) into note from public.private_notes n where id=eid and workspace_id=p_workspace_id and workout_instance_id=wid; end if;
 if note is null and base>0 then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if (coalesce((note->>'revision')::integer,0)<>base or exists(select 1 from public.workout_sync_conflicts c where c.workspace_id=p_workspace_id and c.entity_id=eid and c.kind='set_note' and c.resolved_at is null)) and not force_version then
 current_value:=coalesce(note,'{}'); rev:=(note->>'revision')::integer;
 -- Only moving the shared row changes the stored version; another conflict
 -- merely captures another immutable incoming version of the same row.
 if note->>'shared'='true' then rev:=rev+1; end if;
 -- Move any shared version into private storage in the same transaction.
 if note->>'shared'='true' then
 insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wid,note->>'text',(note->>'author_user_id')::uuid,(note->>'device_id')::uuid,rev);
 delete from public.session_notes where id=eid; end if;
 else
 rev:=coalesce((note->>'revision')::integer,0)+1;
 delete from public.session_notes where workspace_id=p_workspace_id and id=eid;
 delete from public.private_notes where workspace_id=p_workspace_id and id=eid;
 if (p->>'shared')::boolean then insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wid,p->>'text',auth.uid(),dev,rev);
 else insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wid,p->>'text',auth.uid(),dev,rev); end if;
 end if;
 end if;
 if current_value is not null then raise exception 'stale_conflict' using errcode='22023'; end if;
 return jsonb_build_object('status','applied','revision',rev);
end;
$$;

revoke all on function private.apply_correction_operation(uuid,jsonb,boolean,uuid) from public,anon,authenticated;

alter table public.workout_correction_drafts add constraint workout_correction_drafts_tenant_key unique(workspace_id,workout_instance_id,id);
alter table public.workout_correction_drafts add column applied_at timestamptz;
alter table public.workout_correction_drafts add column applied_request_id uuid unique;
create table private.workout_correction_receipts (
 request_id uuid primary key, user_id uuid not null references auth.users(id),
 workspace_id uuid not null references public.trainer_workspaces(id), workout_id uuid not null,
 draft_id uuid not null unique references public.workout_correction_drafts(id),
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 foreign key(workspace_id,workout_id,draft_id) references public.workout_correction_drafts(workspace_id,workout_instance_id,id),
 unique(workspace_id,workout_id,draft_id,request_id),
 unique(workspace_id,workout_id,request_id)
);
create table private.workout_correction_audit (
 request_id uuid primary key references private.workout_correction_receipts(request_id),
 user_id uuid not null references auth.users(id), workspace_id uuid not null references public.trainer_workspaces(id),
 workout_id uuid not null, draft_id uuid not null references public.workout_correction_drafts(id),
 operation jsonb not null, before_version jsonb not null, after_version jsonb not null,
 created_at timestamptz not null default now(),
 foreign key(workspace_id,workout_id,draft_id,request_id) references private.workout_correction_receipts(workspace_id,workout_id,draft_id,request_id)
);
alter table private.workout_correction_receipts enable row level security;
alter table private.workout_correction_audit enable row level security;
revoke all on private.workout_correction_receipts,private.workout_correction_audit from public,anon,authenticated;

create function private.reject_correction_record_mutation() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'immutable_correction_record' using errcode='22023'; end; $$;
revoke all on function private.reject_correction_record_mutation() from public,anon,authenticated;
create trigger workout_correction_receipts_immutable before update or delete on private.workout_correction_receipts for each row execute function private.reject_correction_record_mutation();
create trigger workout_correction_audit_immutable before update or delete on private.workout_correction_audit for each row execute function private.reject_correction_record_mutation();
alter table public.workout_correction_drafts add constraint workout_correction_drafts_applied_check check ((applied_at is null)=(applied_request_id is null));
alter table public.workout_correction_drafts add constraint workout_correction_drafts_applied_receipt foreign key(workspace_id,workout_instance_id,id,applied_request_id) references private.workout_correction_receipts(workspace_id,workout_id,draft_id,request_id);
alter table public.workout_instances add constraint workout_instances_correction_receipt foreign key(workspace_id,id,last_correction_request_id) references private.workout_correction_receipts(workspace_id,workout_id,request_id) deferrable initially deferred;
alter table public.workout_exercises add constraint workout_exercises_correction_receipt foreign key(workspace_id,workout_instance_id,last_correction_request_id) references private.workout_correction_receipts(workspace_id,workout_id,request_id) deferrable initially deferred;

create function private.validate_correction_note_snapshot(n jsonb,p_workspace_id uuid,p_workout_id uuid,p_entity_id uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare key text; allowed text[]:=array['id','workspace_id','workout_instance_id','text','author_user_id','device_id','revision','created_at','updated_at','created_by','shared','client_record_id'];
begin
 if jsonb_typeof(n) is distinct from 'object' or not(n ?& array['id','workspace_id','workout_instance_id','text','author_user_id','device_id','revision','created_at','updated_at','created_by','shared'])
 or exists(select 1 from jsonb_object_keys(n) a where not(a=any(allowed)))
 or jsonb_typeof(n->'text') is distinct from 'string' or jsonb_typeof(n->'shared') is distinct from 'boolean'
 or jsonb_typeof(n->'revision') is distinct from 'number' or coalesce(n->>'revision','')!~'^[1-9][0-9]*$'
 or (n ? 'client_record_id' and n->'client_record_id'<>'null'::jsonb)
 then raise exception 'invalid_payload' using errcode='22023'; end if;
 foreach key in array array['id','workspace_id','workout_instance_id','author_user_id','device_id'] loop
 if jsonb_typeof(n->key) is distinct from 'string' or coalesce(n->>key,'')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_payload' using errcode='22023'; end if;
 end loop;
 if n->'created_by'<>'null'::jsonb and (jsonb_typeof(n->'created_by') is distinct from 'string' or coalesce(n->>'created_by','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if jsonb_typeof(n->'created_at') is distinct from 'string' or jsonb_typeof(n->'updated_at') is distinct from 'string' then raise exception 'invalid_payload' using errcode='22023'; end if;
 begin
 perform (n->>'revision')::integer;
 perform (n->>'created_at')::timestamptz;
 perform (n->>'updated_at')::timestamptz;
 exception when others then raise exception 'invalid_payload' using errcode='22023'; end;
 if (n->>'id')::uuid is distinct from p_entity_id or (n->>'workspace_id')::uuid is distinct from p_workspace_id
 or (n->>'workout_instance_id')::uuid is distinct from p_workout_id or (n->>'author_user_id')::uuid is distinct from auth.uid()
 or (n->'created_by'<>'null'::jsonb and (n->>'created_by')::uuid is distinct from auth.uid()) then raise exception 'invalid_provenance' using errcode='22023'; end if;
end; $$;
revoke all on function private.validate_correction_note_snapshot(jsonb,uuid,uuid,uuid) from public,anon,authenticated;

create function private.validate_correction_envelope(o jsonb) returns void language plpgsql set search_path=pg_catalog as $$
declare k text; p jsonb; allowed text[]; key text;
begin
 if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])
 or exists(select 1 from jsonb_object_keys(o) a where not(a=any(array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])))
 or jsonb_typeof(o->'base_revision') is distinct from 'number' or coalesce(o->>'base_revision','')!~'^[0-9]+$' then raise exception 'invalid_envelope' using errcode='22023'; end if;
 foreach key in array array['operation_id','entity_id','device_id'] loop
 if jsonb_typeof(o->key) is distinct from 'string' or coalesce(o->>key,'')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'invalid_envelope' using errcode='22023'; end if;
 end loop;
 if jsonb_typeof(o->'created_at') is distinct from 'string' then raise exception 'invalid_envelope' using errcode='22023'; end if;
 begin perform (o->>'created_at')::timestamptz; perform (o->>'base_revision')::integer; exception when others then raise exception 'invalid_envelope' using errcode='22023'; end;
 k:=o->>'kind';p:=o->'payload';
 allowed:=case k when 'add_exercise' then array['workout_instance_id','exercise_id','position','planned_sets']
 when 'replace_exercise' then array['workout_instance_id','replaced_from_id','exercise_id','position','planned_sets']
 when 'upsert_set' then array['workout_instance_id','workout_exercise_id','position','reps','seconds','weight_g']
 when 'delete_set' then array['workout_instance_id','workout_exercise_id'] when 'set_note' then array['workout_instance_id','text','shared']
 when 'resolve_conflict' then array['conflict_id','selected_version','expected_revision'] else null end;
 if allowed is null then raise exception 'unsupported_correction' using errcode='22023'; end if;
 if jsonb_typeof(p) is distinct from 'object' or not(p ?& allowed) or exists(select 1 from jsonb_object_keys(p) a where not(a=any(allowed))) then raise exception 'invalid_payload' using errcode='22023'; end if;
 for key in select jsonb_object_keys(p) loop
 if key in ('workout_instance_id','workout_exercise_id','exercise_id','replaced_from_id','conflict_id') and (jsonb_typeof(p->key) is distinct from 'string' or coalesce(p->>key,'')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if key in ('position','planned_sets','expected_revision','reps','seconds','weight_g') and not(key in ('reps','seconds','weight_g') and p->key='null'::jsonb) then
 if jsonb_typeof(p->key) is distinct from 'number' or coalesce(p->>key,'')!~'^[0-9]+$' then raise exception 'invalid_payload' using errcode='22023'; end if;
 begin perform (p->>key)::integer; exception when others then raise exception 'invalid_payload' using errcode='22023'; end;
 end if;
 end loop;
 if k='set_note' and (jsonb_typeof(p->'text') is distinct from 'string' or jsonb_typeof(p->'shared') is distinct from 'boolean') then raise exception 'invalid_payload' using errcode='22023'; end if;
 if k='resolve_conflict' and (coalesce(p->>'selected_version','') not in ('current','incoming') or (p->>'expected_revision')::integer<1) then raise exception 'invalid_payload' using errcode='22023'; end if;
end; $$;
revoke all on function private.validate_correction_envelope(jsonb) from public,anon,authenticated;

create function private.correction_context(p_workspace_id uuid,p_workout_id uuid,p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare d public.workout_correction_drafts; w public.workout_instances; o jsonb; p jsonb; c public.workout_sync_conflicts;
 eid uuid; xid uuid; k text; n jsonb; e jsonb; er integer:=0; xr integer; allowed text[];
begin
 select * into w from public.workout_instances where workspace_id=p_workspace_id and id=p_workout_id;
 select * into d from public.workout_correction_drafts where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=p_draft_id;
 if w.id is null or d.id is null or w.finished_at is null then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 o:=d.operation;
 perform private.validate_correction_envelope(o);
 if jsonb_typeof(o) is distinct from 'object' or not(o ?& array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])
 or exists(select 1 from jsonb_object_keys(o) a where not(a=any(array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])))
 or jsonb_typeof(o->'base_revision') is distinct from 'number' or coalesce(o->>'base_revision','')!~'^[0-9]+$'
 or (o->>'operation_id')::uuid is null or (o->>'entity_id')::uuid is null or (o->>'device_id')::uuid is null
 or (o->>'created_at')::timestamptz is null then raise exception 'invalid_envelope' using errcode='22023'; end if;
 if not exists(select 1 from public.sync_operations s where s.operation_id=(o->>'operation_id')::uuid
 and s.workspace_id=p_workspace_id and s.user_id=auth.uid() and s.envelope=o
 and s.result->>'status'='correction_draft' and s.result->>'draft_id'=p_draft_id::text) then raise exception 'invalid_provenance' using errcode='22023'; end if;
 k:=o->>'kind'; eid:=(o->>'entity_id')::uuid; p:=o->'payload';
 if k='resolve_conflict' then
 select * into c from public.workout_sync_conflicts where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=(p->>'conflict_id')::uuid;
 if c.id is null or c.entity_id<>eid then raise exception 'stale_conflict' using errcode='22023'; end if;
 perform private.validate_correction_envelope(c.incoming_operation);
 k:=c.kind; p:=c.incoming_operation->'payload';
 end if;
 allowed:=case k when 'add_exercise' then array['workout_instance_id','exercise_id','position','planned_sets']
 when 'replace_exercise' then array['workout_instance_id','replaced_from_id','exercise_id','position','planned_sets']
 when 'upsert_set' then array['workout_instance_id','workout_exercise_id','position','reps','seconds','weight_g']
 when 'delete_set' then array['workout_instance_id','workout_exercise_id'] when 'set_note' then array['workout_instance_id','text','shared'] else null end;
 if allowed is null then raise exception 'unsupported_correction' using errcode='22023'; end if;
 if jsonb_typeof(p) is distinct from 'object' or not(p ?& allowed) or exists(select 1 from jsonb_object_keys(p) a where not(a=any(allowed)))
 or (p->>'workout_instance_id')::uuid is distinct from p_workout_id then raise exception 'invalid_payload' using errcode='22023'; end if;
 if k in ('upsert_set','delete_set') then
 xid:=(p->>'workout_exercise_id')::uuid;
 select to_jsonb(s),s.revision into n,er from public.set_results s where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and workout_exercise_id=xid and id=eid;
 elsif k='set_note' then
 select to_jsonb(s)||jsonb_build_object('shared',true),s.revision into n,er from public.session_notes s where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=eid;
 if n is null then select to_jsonb(s)||jsonb_build_object('shared',false),s.revision into n,er from public.private_notes s where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=eid; end if;
 elsif k='replace_exercise' then xid:=(p->>'replaced_from_id')::uuid;
 else select to_jsonb(s),s.revision into n,er from public.workout_exercises s where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=eid;
 end if;
 if xid is not null then select to_jsonb(s),s.revision into e,xr from public.workout_exercises s where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=xid;
 if e is null then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k='replace_exercise' then n:=e;er:=xr;xr:=null; end if; end if;
 return jsonb_build_object('account_id',auth.uid(),'workspace_id',p_workspace_id,'workout_id',p_workout_id,'draft_id',p_draft_id,
 'operation',o,'finished_at',w.finished_at,'workout_revision',w.revision,'entity_revision',coalesce(er,0),'exercise_revision',xr,
 'current_version',jsonb_build_object('entity',n,'exercise',e,'sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where workspace_id=p_workspace_id and workout_exercise_id=xid),
 'replacements',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.id),'[]'::jsonb) from public.workout_exercises s where workspace_id=p_workspace_id and replaced_from_id=xid)),
 'conflict',case when c.id is null then null else to_jsonb(c) end,'applied_at',d.applied_at,'applied_request_id',d.applied_request_id,
 'receipt',(select result from private.workout_correction_receipts where draft_id=d.id));
end; $$;
revoke all on function private.correction_context(uuid,uuid,uuid) from public,anon,authenticated;

create function public.get_workout_correction(p_actor_id uuid,p_workspace_id uuid,p_workout_id uuid,p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_actor_id is distinct from auth.uid() then raise exception 'account_changed' using errcode='42501'; end if;
 if not public.is_workspace_owner(p_workspace_id) then raise exception 'entity_unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,29));
 return private.correction_context(p_workspace_id,p_workout_id,p_draft_id);
end; $$;

create function public.list_workout_corrections(p_actor_id uuid,p_workspace_id uuid,p_workout_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_actor_id is distinct from auth.uid() then raise exception 'account_changed' using errcode='42501'; end if;
 if not public.is_workspace_owner(p_workspace_id) then raise exception 'entity_unavailable' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,29));
 if not exists(select 1 from public.workout_instances where workspace_id=p_workspace_id and id=p_workout_id and finished_at is not null) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if (select count(*) from public.workout_correction_drafts where workspace_id=p_workspace_id and workout_instance_id=p_workout_id)>100 then raise exception 'too_many_corrections' using errcode='22023'; end if;
 return jsonb_build_object('account_id',auth.uid(),'workspace_id',p_workspace_id,'workout_id',p_workout_id,'drafts',
 (select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at,d.id),'[]'::jsonb) from (select id,operation,created_at,applied_at,applied_request_id from public.workout_correction_drafts where workspace_id=p_workspace_id and workout_instance_id=p_workout_id order by created_at,id limit 100) d));
end; $$;

create function public.apply_workout_correction(p_actor_id uuid,p_workspace_id uuid,p_workout_id uuid,p_draft_id uuid,p_request_id uuid,
 p_expected_workout_revision integer,p_expected_entity_revision integer,p_expected_exercise_revision integer default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare d public.workout_correction_drafts; r private.workout_correction_receipts; before_value jsonb; after_value jsonb;
 req jsonb; result jsonb; applied jsonb; o jsonb; k text; entity_rev integer;
begin
 if auth.uid() is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if p_actor_id is distinct from auth.uid() then raise exception 'account_changed' using errcode='42501'; end if;
 if not public.is_workspace_owner(p_workspace_id) then raise exception 'entity_unavailable' using errcode='42501'; end if;
 if p_workout_id is null or p_draft_id is null or p_request_id is null or p_expected_workout_revision is null or p_expected_workout_revision<1
 or p_expected_entity_revision is null or p_expected_entity_revision<0 or p_expected_exercise_revision<1 then raise exception 'invalid_request' using errcode='22023'; end if;
 req:=jsonb_build_object('actor_id',p_actor_id,'workspace_id',p_workspace_id,'workout_id',p_workout_id,'draft_id',p_draft_id,'request_id',p_request_id,
 'workout_revision',p_expected_workout_revision,'entity_revision',p_expected_entity_revision,'exercise_revision',p_expected_exercise_revision);
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,29));
 perform pg_advisory_xact_lock(hashtextextended('workout-correction:'||p_request_id::text,29));
 select * into r from private.workout_correction_receipts where request_id=p_request_id;
 if found then if r.request is distinct from req then raise exception 'request_id_reused' using errcode='22023'; end if; return r.result; end if;
 perform 1 from public.workout_instances where workspace_id=p_workspace_id and id=p_workout_id for update;
 select * into d from public.workout_correction_drafts where workspace_id=p_workspace_id and workout_instance_id=p_workout_id and id=p_draft_id for update;
 if not found then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if d.applied_at is not null then raise exception 'draft_already_applied' using errcode='22023'; end if;
 before_value:=private.correction_context(p_workspace_id,p_workout_id,p_draft_id);
 if (before_value->>'workout_revision')::integer is distinct from p_expected_workout_revision
 or (before_value->>'entity_revision')::integer is distinct from p_expected_entity_revision
 or (before_value->>'exercise_revision')::integer is distinct from p_expected_exercise_revision then raise exception 'stale_correction' using errcode='22023'; end if;
 o:=d.operation;
 perform private.validate_correction_envelope(o);k:=o->>'kind';
 if k<>'resolve_conflict' and ((k='add_exercise' and (p_expected_entity_revision<>0 or (o->>'base_revision')::integer<>0))
 or (k='replace_exercise' and (o->>'base_revision')::integer<>0)
 or (k in ('upsert_set','delete_set','set_note') and (o->>'base_revision')::integer<>p_expected_entity_revision)) then raise exception 'stale_correction' using errcode='22023'; end if;
 if k='set_note' and exists(select 1 from public.workout_sync_conflicts where workspace_id=p_workspace_id and entity_id=(o->>'entity_id')::uuid and resolved_at is null) then raise exception 'stale_conflict' using errcode='22023'; end if;
 if k in ('upsert_set','delete_set') and ((before_value->'current_version'->'exercise'->>'skipped')::boolean or before_value->'current_version'->'entity'->>'deleted_at' is not null) then raise exception 'stale_conflict' using errcode='22023'; end if;
 if k='replace_exercise' and exists(select 1 from public.set_results where workspace_id=p_workspace_id and workout_exercise_id=(o->'payload'->>'replaced_from_id')::uuid) then raise exception 'stale_conflict' using errcode='22023'; end if;
 applied:=private.apply_correction_operation(p_workspace_id,o,true,p_request_id);
 if applied->>'status' is distinct from 'applied' then raise exception 'stale_correction' using errcode='22023'; end if;
 entity_rev:=(applied->>'revision')::integer;
 update public.workout_instances set last_correction_request_id=p_request_id where workspace_id=p_workspace_id and id=p_workout_id;
 after_value:=private.correction_context(p_workspace_id,p_workout_id,p_draft_id);
 result:=jsonb_build_object('account_id',auth.uid(),'workspace_id',p_workspace_id,'workout_id',p_workout_id,'draft_id',p_draft_id,
 'request_id',p_request_id,'status','applied','revision',(after_value->>'workout_revision')::integer,'entity_revision',entity_rev,'finished_at',after_value->'finished_at');
 insert into private.workout_correction_receipts(request_id,user_id,workspace_id,workout_id,draft_id,request,result) values(p_request_id,auth.uid(),p_workspace_id,p_workout_id,p_draft_id,req,result);
 insert into private.workout_correction_audit(request_id,user_id,workspace_id,workout_id,draft_id,operation,before_version,after_version) values(p_request_id,auth.uid(),p_workspace_id,p_workout_id,p_draft_id,o,before_value,after_value);
 update public.workout_correction_drafts set applied_at=now(),applied_request_id=p_request_id where id=p_draft_id and workspace_id=p_workspace_id;
 return result;
end; $$;
revoke all on function public.get_workout_correction(uuid,uuid,uuid,uuid), public.list_workout_corrections(uuid,uuid,uuid), public.apply_workout_correction(uuid,uuid,uuid,uuid,uuid,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.get_workout_correction(uuid,uuid,uuid,uuid), public.list_workout_corrections(uuid,uuid,uuid), public.apply_workout_correction(uuid,uuid,uuid,uuid,uuid,integer,integer,integer) to authenticated;
commit;
