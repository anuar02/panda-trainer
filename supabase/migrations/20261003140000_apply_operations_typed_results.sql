begin;

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
