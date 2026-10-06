begin;

create function private.touch_set_result() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 new.updated_at := now();
 if (to_jsonb(new)-'position'-'updated_at') is distinct from (to_jsonb(old)-'position'-'updated_at') then new.revision := old.revision+1;
 else new.revision := old.revision; end if;
 return new;
end;
$$;
revoke all on function private.touch_set_result() from public,anon,authenticated;
drop trigger set_results_touch_updated_at on public.set_results;
create trigger set_results_touch_updated_at before update on public.set_results for each row execute function private.touch_set_result();

create or replace function private.apply_workout_operation(p_workspace_id uuid, o jsonb, force_version boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 k text := o->>'kind'; p jsonb := o->'payload'; eid uuid := (o->>'entity_id')::uuid;
 base integer := (o->>'base_revision')::integer; dev uuid := (o->>'device_id')::uuid;
 wid uuid; wi public.workout_instances; ex public.workout_exercises; sr public.set_results;
 lib public.exercises; note jsonb; current_value jsonb; rev integer; conflict uuid; draft uuid;
 allowed text[]; cf public.workout_sync_conflicts; result jsonb; oldid uuid; note_shared boolean;
begin
 allowed := case k
 when 'create_workout' then array['booking_id']
 when 'add_exercise' then array['workout_instance_id','exercise_id','position','planned_sets']
 when 'replace_exercise' then array['workout_instance_id','replaced_from_id','exercise_id','position','planned_sets']
 when 'upsert_set' then array['workout_instance_id','workout_exercise_id','position','reps','seconds','weight_g']
 when 'delete_set' then array['workout_instance_id','workout_exercise_id']
 when 'set_note' then array['workout_instance_id','text','shared']
 when 'finish_workout' then array[]::text[]
 when 'resolve_conflict' then array['conflict_id','selected_version','expected_revision'] else null end;
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
 select * into wi from public.workout_instances where workspace_id=p_workspace_id and id=cf.workout_instance_id for update;
 if cf.kind in ('upsert_set','delete_set') then select revision into rev from public.set_results where workspace_id=p_workspace_id and id=eid;
 if rev is null then select revision into rev from public.workout_exercises where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid; end if;
 elsif cf.kind='set_note' then select revision into rev from public.private_notes where workspace_id=p_workspace_id and id=eid;
 elsif cf.kind='replace_exercise' then select revision into rev from public.workout_exercises where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'replaced_from_id')::uuid;
 else rev:=wi.revision; end if;
 if cf.current_version ? 'exercise_revision' and
 (select revision from public.workout_exercises where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid) is distinct from (cf.current_version->>'exercise_revision')::integer then
 raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.current_version ? 'replacements' and cf.current_version->'replacements' is distinct from
 (select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=e.id)) order by e.position,e.id),'[]'::jsonb) from public.workout_exercises e where e.workspace_id=p_workspace_id and e.replaced_from_id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid) then
 raise exception 'stale_conflict' using errcode='22023'; end if;
 if cf.kind='replace_exercise' and cf.current_version->'sets' is distinct from
 (select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=(cf.incoming_operation->'payload'->>'replaced_from_id')::uuid) then
 raise exception 'stale_conflict' using errcode='22023'; end if;
 if rev is distinct from cf.expected_revision then raise exception 'stale_conflict' using errcode='22023'; end if;
 if wi.finished_at is not null and cf.kind<>'set_note' then
 insert into public.workout_correction_drafts(workspace_id,workout_instance_id,operation) values(p_workspace_id,wi.id,o) returning id into draft;
 return jsonb_build_object('status','correction_draft','revision',wi.revision,'draft_id',draft); end if;
 if cf.kind='set_note' then
 -- Restore the actual chosen snapshot, including its visibility intent.
 note := case when p->>'selected_version'='current' then cf.current_version else
 jsonb_build_object('text',cf.incoming_operation->'payload'->>'text','shared',cf.incoming_operation->'payload'->'shared','author_user_id',auth.uid(),'device_id',cf.incoming_operation->>'device_id') end;
 note_shared := (note->>'shared')::boolean and not exists(select 1 from public.workout_sync_conflicts c where c.workspace_id=p_workspace_id and c.entity_id=eid and c.kind='set_note' and c.resolved_at is null and c.id<>cf.id);
 rev:=rev+1;
 delete from public.session_notes where workspace_id=p_workspace_id and id=eid;
 delete from public.private_notes where workspace_id=p_workspace_id and id=eid;
 if note_shared then
 insert into public.session_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wi.id,note->>'text',(note->>'author_user_id')::uuid,(note->>'device_id')::uuid,rev);
 else
 insert into public.private_notes(id,workspace_id,workout_instance_id,text,author_user_id,device_id,revision) values(eid,p_workspace_id,wi.id,note->>'text',(note->>'author_user_id')::uuid,(note->>'device_id')::uuid,rev);
 end if;
 result:=jsonb_build_object('status','applied','revision',rev);
 elsif p->>'selected_version'='incoming' then
 result := private.apply_workout_operation(p_workspace_id,cf.incoming_operation,true);
 if result->>'status'<>'applied' then return result; end if;
 else
 if cf.kind in ('upsert_set','delete_set') then update public.set_results set revision=revision+1 where workspace_id=p_workspace_id and id=eid returning revision into rev;
 if not found then update public.workout_exercises set revision=revision+1 where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid returning revision into rev;
 else update public.workout_exercises set revision=revision+1 where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'workout_exercise_id')::uuid; end if;

 elsif cf.kind='replace_exercise' then update public.workout_exercises set revision=revision+1 where workspace_id=p_workspace_id and id=(cf.incoming_operation->'payload'->>'replaced_from_id')::uuid returning revision into rev;
 else update public.workout_instances set revision=revision+1 where workspace_id=p_workspace_id and id=cf.workout_instance_id returning revision into rev; end if;
 result := jsonb_build_object('status','applied','revision',rev); end if;
 update public.workout_sync_conflicts set resolved_at=now(),selected_version=p->>'selected_version' where id=cf.id;
 if cf.kind='set_note' then
 -- Choosing one immutable version does not discard the other conflicts.
 -- Refresh their resolution token; a device holding the old token must reload.
 update public.workout_sync_conflicts set expected_revision=rev where workspace_id=p_workspace_id and entity_id=eid and kind='set_note' and resolved_at is null;
 end if;
 return result;
 end if;
 if k='create_workout' then
 if base<>0 then raise exception 'invalid_revision' using errcode='22023'; end if;
 insert into public.workout_instances(id,workspace_id,booking_id,client_record_id)
 select eid,p_workspace_id,b.id,b.client_record_id from public.bookings b where b.id=(p->>'booking_id')::uuid and b.workspace_id=p_workspace_id;
 if not found then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 return jsonb_build_object('status','applied','revision',1);
 end if;
 if k in ('upsert_set','delete_set') and exists(select 1 from public.set_results where id=eid and (workspace_id<>p_workspace_id or workout_instance_id<>(p->>'workout_instance_id')::uuid or workout_exercise_id<>(p->>'workout_exercise_id')::uuid)) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 if k='set_note' and (exists(select 1 from public.session_notes where id=eid and (workspace_id<>p_workspace_id or workout_instance_id<>(p->>'workout_instance_id')::uuid)) or exists(select 1 from public.private_notes where id=eid and (workspace_id<>p_workspace_id or workout_instance_id is distinct from (p->>'workout_instance_id')::uuid))) then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 wid := case when k='finish_workout' then eid else (p->>'workout_instance_id')::uuid end;
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
 if wi.finished_at is not null then
 insert into public.workout_correction_drafts(workspace_id,workout_instance_id,operation) values(p_workspace_id,wid,o) returning id into draft;
 return jsonb_build_object('status','correction_draft','revision',wi.revision,'draft_id',draft);
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
 else update public.workout_exercises set skipped=true,revision=revision+1 where id=oldid; end if;
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
 current_value:=coalesce(to_jsonb(sr),to_jsonb(ex))||jsonb_build_object('exercise_revision',ex.revision,'exercise',to_jsonb(ex),'sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=ex.id),'replacements',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('sets',(select coalesce(jsonb_agg(to_jsonb(s) order by s.position,s.device_id,s.id),'[]'::jsonb) from public.set_results s where s.workspace_id=p_workspace_id and s.workout_exercise_id=e.id)) order by e.position,e.id),'[]'::jsonb) from public.workout_exercises e where e.workspace_id=p_workspace_id and e.replaced_from_id=ex.id)); rev:=coalesce(sr.revision,ex.revision);
 else
 if ex.skipped and force_version then
 update public.workout_exercises set skipped=false where workspace_id=p_workspace_id and id=ex.id;
 update public.workout_exercises set skipped=true,revision=revision+1 where workspace_id=p_workspace_id and replaced_from_id=ex.id and not skipped;
 end if;
 if k='delete_set' then
 if sr.id is null then raise exception 'entity_unavailable' using errcode='P0002'; end if;
 update public.set_results set deleted_at=now(),revision=revision+1,device_id=dev where id=eid returning revision into rev;
 else
 insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,requested_position,reps,seconds,weight_g,author_user_id,device_id)
 values(eid,p_workspace_id,wid,ex.id,(p->>'position')::integer,(p->>'position')::integer,(p->>'reps')::integer,(p->>'seconds')::integer,(p->>'weight_g')::integer,auth.uid(),dev)
 on conflict(id) do update set reps=excluded.reps,seconds=excluded.seconds,weight_g=excluded.weight_g,device_id=dev,deleted_at=null,revision=public.set_results.revision+1 returning revision into rev;
 update public.set_results s set position=q.pos from (select id,(row_number() over(order by coalesce(requested_position,position),device_id,id)-1)::integer pos from public.set_results where workspace_id=p_workspace_id and workout_exercise_id=ex.id) q where s.id=q.id and s.position is distinct from q.pos;
 end if;
 update public.workout_exercises set revision=revision+1 where workspace_id=p_workspace_id and id=ex.id;
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
 elsif k='finish_workout' then
 if base<>wi.revision and not force_version then current_value:=to_jsonb(wi);rev:=wi.revision;
 else update public.workout_instances set finished_at=now(),revision=revision+1 where id=wid returning revision into rev; end if;
 end if;
 if current_value is not null then
 insert into public.workout_sync_conflicts(workspace_id,workout_instance_id,entity_id,kind,current_version,incoming_operation,expected_revision)
 values(p_workspace_id,wid,eid,k,current_value,o,rev) returning id into conflict;
 return jsonb_build_object('status','conflict','revision',rev,'conflict_id',conflict);
 end if;
 return jsonb_build_object('status','applied','revision',rev);
end;
$$;

create or replace function public.apply_operations(p_workspace_id uuid,p_operations jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare o jsonb; receipt public.sync_operations; r jsonb; results jsonb:='[]'::jsonb; opid uuid; eid uuid;
begin
 if auth.uid() is null or not public.is_workspace_owner(p_workspace_id) then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 if jsonb_typeof(p_operations) is distinct from 'array' or jsonb_array_length(p_operations) not between 1 and 100 then raise exception 'Invalid operations' using errcode='22023'; end if;
 -- All calls for one workspace serialize, including duplicate operation IDs.
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,29));
 -- Operation IDs are global: lock in a stable order across tenant batches too.
 perform pg_advisory_xact_lock(hashtextextended('workout-operation:'||ids.id,29))
 from (select distinct (value->>'operation_id')::uuid::text id from jsonb_array_elements(p_operations)
 where coalesce(value->>'operation_id','') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' order by id) ids;
 for o in select value from jsonb_array_elements(p_operations) loop
 opid:=null;eid:=null;
 begin
 opid:=(o->>'operation_id')::uuid;eid:=(o->>'entity_id')::uuid;
 if jsonb_typeof(o)<>'object' or not(o ?& array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])
 or exists(select 1 from jsonb_object_keys(o) a where not(a=any(array['operation_id','kind','entity_id','base_revision','device_id','payload','created_at'])))
 or opid is null or eid is null or (o->>'device_id')::uuid is null or (o->>'created_at')::timestamptz is null
 or jsonb_typeof(o->'base_revision') is distinct from 'number' or coalesce(o->>'base_revision','')!~'^[0-9]+$' then raise exception 'invalid_envelope' using errcode='22023'; end if;
 select * into receipt from public.sync_operations where operation_id=opid;
 if found then
 if receipt.workspace_id<>p_workspace_id or receipt.user_id<>auth.uid() or receipt.envelope is distinct from o then r:=jsonb_build_object('status','error','revision',null,'error_code','operation_id_reused'); else r:=receipt.result; end if;
 else
 begin r:=private.apply_workout_operation(p_workspace_id,o);
 exception when others then r:=jsonb_build_object('status','error','revision',null,'error_code',case when sqlstate in ('22023','P0002') then sqlerrm else sqlstate end); end;
 r:=r||jsonb_build_object('operation_id',opid,'entity_id',eid);
 insert into public.sync_operations(operation_id,workspace_id,user_id,device_id,kind,entity_id,base_revision,result,envelope)
 values(opid,p_workspace_id,auth.uid(),(o->>'device_id')::uuid,o->>'kind',eid,(o->>'base_revision')::integer,r,o);
 end if;
 exception when others then r:=jsonb_build_object('status','error','revision',null,'error_code','invalid_envelope'); end;
 results:=results||jsonb_build_array(r||jsonb_build_object('operation_id',coalesce(opid::text,o->>'operation_id'),'entity_id',coalesce(eid::text,o->>'entity_id')));
 end loop;
 return jsonb_build_object('account_id',auth.uid(),'workspace_id',p_workspace_id,'results',results);
end;
$$;
commit;
