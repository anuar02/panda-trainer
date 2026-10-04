begin;

-- The receipt deliberately has no Auth/workspace FK: it survives both deletions.
create table private.account_deletion_requests (
 request_id uuid primary key,
 user_id uuid not null unique,
 capability_hash text not null check (capability_hash ~ '^[0-9a-f]{64}$'),
 workspace_ids uuid[] not null,
 status text not null check (status in ('prepared','database_deleted','complete')),
 created_at timestamptz not null default clock_timestamp(),
 database_deleted_at timestamptz,
 completed_at timestamptz
);
create table private.account_deletion_context (
 transaction_id bigint primary key,
 request_id uuid not null references private.account_deletion_requests(request_id)
);
alter table private.account_deletion_requests enable row level security;
alter table private.account_deletion_context enable row level security;
revoke all on private.account_deletion_requests,private.account_deletion_context from public,anon,authenticated,service_role;

create function private.account_deletion_current()
returns private.account_deletion_requests language sql volatile security definer set search_path=pg_catalog as $$
 select r from private.account_deletion_requests r join private.account_deletion_context c using(request_id)
 where c.transaction_id=txid_current() and r.status='prepared';
$$;

-- A shared transaction lock serializes every indexed application write with prepare
-- and execute. Row guards also fence service writers that have no JWT actor.
-- Application mutation transactions must use READ COMMITTED; a retained snapshot
-- cannot be allowed to hide a committed deletion fence after waiting for the lock.
create function private.account_deletion_write_lock() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'account_deletion_requires_read_committed' using errcode='55000';
 end if;
 perform pg_advisory_xact_lock(410041,1);
 return null;
end; $$;
create function private.account_deletion_write_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare v jsonb; oldv jsonb; r private.account_deletion_requests; a record; w uuid; u uuid;
begin
 r:=private.account_deletion_current();
 if r.request_id is not null then return case when tg_op='DELETE' then old else new end; end if;
 if exists(select 1 from private.account_deletion_requests where user_id=auth.uid()) then
  raise exception 'account_deletion_in_progress' using errcode='55000';
 end if;
 v:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 oldv:=case when tg_op='UPDATE' then to_jsonb(old) else v end;
 w:=case when tg_table_name='trainer_workspaces' then (v->>'id')::uuid else (v->>'workspace_id')::uuid end;
 if exists(select 1 from private.account_deletion_requests where w=any(workspace_ids) or (oldv->>'workspace_id')::uuid=any(workspace_ids)) then
  raise exception 'account_deletion_in_progress' using errcode='55000';
 end if;
 for a in select att.attname from pg_constraint fk join pg_attribute att on att.attrelid=fk.conrelid and att.attnum=fk.conkey[1]
 where fk.contype='f' and fk.conrelid=tg_relid and fk.confrelid='auth.users'::regclass and array_length(fk.conkey,1)=1 loop
  u:=(v->>a.attname)::uuid;
  if exists(select 1 from private.account_deletion_requests where user_id=u) then
   raise exception 'account_deletion_in_progress' using errcode='55000';
  end if;
 end loop;
 if tg_table_name='invitations' and exists(select 1 from public.client_records c join private.account_deletion_requests d on c.workspace_id=any(d.workspace_ids) where c.id=(v->>'client_record_id')::uuid) then
  raise exception 'account_deletion_in_progress' using errcode='55000';
 end if;
 return case when tg_op='DELETE' then old else new end;
end; $$;

-- Retained trainer history loses only the deleted account's audit identity.
-- Composite financial relationships and immutable business values stay intact.
create function private.account_deletion_history_allowed(p_old jsonb,p_new jsonb,p_operation text)
returns boolean language plpgsql volatile security definer set search_path=pg_catalog as $$
declare r private.account_deletion_requests; k text; stripped_old jsonb; stripped_new jsonb;
begin
 r:=private.account_deletion_current();
 if r.request_id is null then return false; end if;
 if p_operation='DELETE' then return (p_old->>'workspace_id')::uuid=any(r.workspace_ids) or p_old->>'actor_user_id'=r.user_id::text; end if;
 if p_operation<>'UPDATE' then return false; end if;
 stripped_old:=p_old; stripped_new:=p_new;
 foreach k in array array['created_by','author_user_id','actor_user_id','user_id'] loop
  if p_old->>k=r.user_id::text and p_new->k='null'::jsonb then
   stripped_old:=stripped_old-k; stripped_new:=stripped_new-k;
  end if;
 end loop;
 return stripped_old=stripped_new;
end; $$;
create or replace function private.reject_billing_history_mutation() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if private.account_deletion_history_allowed(to_jsonb(old),case when tg_op='UPDATE' then to_jsonb(new) else null end,tg_op) then
  return case when tg_op='DELETE' then old else new end;
 end if;
 raise exception 'Billing history is immutable' using errcode='55000';
end; $$;
create or replace function private.reject_correction_record_mutation() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if private.account_deletion_history_allowed(to_jsonb(old),case when tg_op='UPDATE' then to_jsonb(new) else null end,tg_op) then
  return case when tg_op='DELETE' then old else new end;
 end if;
 raise exception 'immutable_correction_record' using errcode='22023';
end; $$;

-- Identity anonymization is not a new scheduling event. Extend only the trigger
-- prologue; the existing event implementation remains unchanged.
do $$ declare definition text; updated text; begin
 definition:=pg_get_functiondef('private.notification_proposal_event()'::regprocedure);
 updated:=replace(definition,E'begin\n  if tg_op',E'begin\n  if (private.account_deletion_current()).request_id is not null then return new; end if;\n  if tg_op');
 if updated=definition then raise exception 'account_deletion_notification_trigger_drift'; end if;
 execute updated;
end; $$;

-- Deferred validation permits cycles (correction receipt/draft and self reversals)
-- only when explicitly requested inside the deletion transaction. No cascade is
-- added; ordinary writes retain immediate checks.
do $$ declare c record; definition text; t record;
begin
 for c in select con.oid,con.conname,con.conrelid,con.condeferred,pg_get_constraintdef(con.oid) definition
 from pg_constraint con join pg_class source on source.oid=con.conrelid join pg_namespace ns on ns.oid=source.relnamespace
 join pg_class target on target.oid=con.confrelid join pg_namespace tn on tn.oid=target.relnamespace
 where con.contype='f' and ns.nspname in ('public','private') and tn.nspname in ('public','private')
 and source.relname not like 'account_deletion_%'
 and ((source.relname in ('workout_correction_receipts','workout_correction_drafts') and target.relname in ('workout_correction_receipts','workout_correction_drafts'))
 or (con.conrelid=con.confrelid and source.relname in ('credit_entries','payment_entries','workout_exercises'))) loop
  definition:=replace(c.definition,'ON DELETE RESTRICT','ON DELETE NO ACTION');
  definition:=regexp_replace(definition,' DEFERRABLE( INITIALLY (DEFERRED|IMMEDIATE))?','');
  definition:=regexp_replace(definition,' NOT DEFERRABLE','');
  execute format('alter table %s drop constraint %I',c.conrelid::regclass,c.conname);
  execute format('alter table %s add constraint %I %s DEFERRABLE INITIALLY %s',c.conrelid::regclass,c.conname,definition,case when c.condeferred then 'DEFERRED' else 'IMMEDIATE' end);
 end loop;
 for c in select distinct con.conrelid,att.attname from pg_constraint con
 join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
 join pg_class source_table on source_table.oid=con.conrelid join pg_namespace ns on ns.oid=source_table.relnamespace
 where con.contype='f' and con.confrelid='auth.users'::regclass and array_length(con.conkey,1)=1
 and ns.nspname in ('public','private') and att.attnotnull and (att.attname in ('created_by','author_user_id','accepted_by') or (att.attname='user_id' and con.conrelid in ('public.sync_operations'::regclass,'private.workout_correction_receipts'::regclass,'private.workout_correction_audit'::regclass))) loop
  execute format('alter table %s alter column %I drop not null',c.conrelid::regclass,c.attname);
 end loop;
 for t in select source_table.oid from pg_class source_table join pg_namespace n on n.oid=source_table.relnamespace
 where n.nspname in ('public','private') and source_table.relkind='r' and source_table.relname not like 'account_deletion_%' loop
  execute format('create trigger account_deletion_lock before insert or update or delete on %s for each statement execute function private.account_deletion_write_lock()',t.oid::regclass);
  execute format('create trigger account_deletion_guard before insert or update or delete on %s for each row execute function private.account_deletion_write_guard()',t.oid::regclass);
 end loop;
end; $$;

create function private.account_deletion_receipt(p_request_id uuid,p_capability_hash text)
returns private.account_deletion_requests language plpgsql security definer set search_path=pg_catalog as $$
declare r private.account_deletion_requests;
begin
 if p_request_id is null or p_capability_hash is null or p_capability_hash !~ '^[0-9a-f]{64}$' then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
 select * into r from private.account_deletion_requests where request_id=p_request_id and capability_hash=p_capability_hash;
 if not found then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
 return r;
end; $$;
create function private.account_deletion_result(r private.account_deletion_requests)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object('request_id',(r).request_id,'user_id',(r).user_id,'status',(r).status);
$$;
create function public.account_deletion_inspect(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ids uuid[]; cards integer;
begin
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into ids from public.trainer_workspaces where owner_user_id=p_user_id;
 select count(*) into cards from public.client_records where user_id=p_user_id and not(workspace_id=any(ids));
 return jsonb_build_object('user_id',p_user_id,'workspace_ids',ids,'foreign_client_card_count',cards,'has_trainer_workspace',cardinality(ids)>0,'has_client_cards',exists(select 1 from public.client_records where user_id=p_user_id));
end; $$;
create function public.account_deletion_prepare(p_request_id uuid,p_user_id uuid,p_capability_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r private.account_deletion_requests; ids uuid[];
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'account_deletion_requires_read_committed' using errcode='55000';
 end if;
 perform pg_advisory_xact_lock(410041,1);
 if p_request_id is null or p_user_id is null or p_capability_hash is null or p_capability_hash !~ '^[0-9a-f]{64}$' then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
 select * into r from private.account_deletion_requests where request_id=p_request_id or user_id=p_user_id;
 if found then
  if r.request_id<>p_request_id or r.user_id<>p_user_id or r.capability_hash<>p_capability_hash then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
  return private.account_deletion_result(r);
 end if;
 perform 1 from auth.users where id=p_user_id for update;
 if not found then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into ids from public.trainer_workspaces where owner_user_id=p_user_id;
 insert into private.account_deletion_requests(request_id,user_id,capability_hash,workspace_ids,status)
 values(p_request_id,p_user_id,p_capability_hash,ids,'prepared') returning * into r;
 return private.account_deletion_result(r);
end; $$;
create function public.account_deletion_status(p_request_id uuid,p_capability_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_request_id is null or p_capability_hash is null or p_capability_hash !~ '^[0-9a-f]{64}$' then raise exception 'account_deletion_unavailable' using errcode='42501'; end if;
 if not exists(select 1 from private.account_deletion_requests where request_id=p_request_id and capability_hash=p_capability_hash) then return null; end if;
 return private.account_deletion_result(private.account_deletion_receipt(p_request_id,p_capability_hash));
end; $$;
create function public.account_deletion_execute(p_request_id uuid,p_capability_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r private.account_deletion_requests; t record; a record; has_reference boolean;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'account_deletion_requires_read_committed' using errcode='55000';
 end if;
 perform pg_advisory_xact_lock(410041,1);
 r:=private.account_deletion_receipt(p_request_id,p_capability_hash);
 if r.status<>'prepared' then return private.account_deletion_result(r); end if;
 insert into private.account_deletion_context(transaction_id,request_id) values(txid_current(),p_request_id);
 set constraints all deferred;
 -- Personal notifications and push state are account data, not retained history.
 delete from private.push_installations where device_id in(select device_id from private.push_devices where user_id=r.user_id);
 delete from private.push_devices where user_id=r.user_id;
 delete from public.notifications where recipient_user_id=r.user_id;
 delete from public.invitations where accepted_by=r.user_id or client_record_id in(select id from public.client_records where workspace_id=any(r.workspace_ids) or user_id=r.user_id);
 -- Private command receipts attributed to the account are not trainer business history.
 for a in select distinct con.conrelid,att.attname from pg_constraint con
 join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
 join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where con.contype='f' and con.confrelid='auth.users'::regclass and array_length(con.conkey,1)=1
 and n.nspname='private' and c.relname not in ('workout_correction_receipts','workout_correction_audit') loop
  execute format('delete from %s where %I=$1',a.conrelid::regclass,a.attname) using r.user_id;
 end loop;
 -- Delete every workspace table captured by its explicit workspace column.
 for t in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute workspace_column on workspace_column.attrelid=c.oid and workspace_column.attname='workspace_id' and not workspace_column.attisdropped
 where n.nspname in ('public','private') and c.relkind='r' and c.relname not like 'account_deletion_%'
 order by array_position(array[
 'workout_correction_audit','workout_correction_receipts',
 'booking_command_abandonments','billing_command_receipts','booking_creation_receipts',
 'booking_reschedule_receipts','booking_status_command_receipts','client_creation_receipts',
 'client_invitation_receipts','program_assignment_receipts','template_command_receipts','workout_preparation_receipts',
 'payment_entries','credit_entries','attendance_revisions','attendance_records','client_purchases',
 'workout_sync_conflicts','workout_correction_drafts','sync_operations',
 'set_results','session_notes','private_notes','workout_exercises','workout_instances',
 'booking_program_exercises','booking_programs','schedule_proposals','bookings','group_sessions',
 'client_program_exercises','client_programs','template_exercises','workout_templates','exercises','notifications','client_records'
 ],c.relname::text) nulls first,c.oid loop
  execute format('delete from %s where workspace_id=any($1)',t.oid::regclass) using r.workspace_ids;
 end loop;
 update public.client_records set user_id=null where user_id=r.user_id;
 -- Nullable audit columns on foreign trainer records are anonymized, never deleted.
 for a in select distinct con.conrelid,att.attname from pg_constraint con
 join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
 join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where con.contype='f' and con.confrelid='auth.users'::regclass and array_length(con.conkey,1)=1
 and n.nspname in ('public','private') and (att.attname in ('created_by','author_user_id','accepted_by') or (att.attname='user_id' and con.conrelid in ('public.sync_operations'::regclass,'private.workout_correction_receipts'::regclass,'private.workout_correction_audit'::regclass))) loop
  execute format('update %s set %I=null where %I=$1',a.conrelid::regclass,a.attname,a.attname) using r.user_id;
 end loop;
 delete from public.trainer_workspaces where id=any(r.workspace_ids);
 delete from public.profiles where user_id=r.user_id;
 -- Fail closed on any uncovered Auth reference; Auth removal must never be the
 -- first discovery of an orphaned account dependency.
 for a in select distinct con.conrelid,att.attname from pg_constraint con
 join pg_attribute att on att.attrelid=con.conrelid and att.attnum=con.conkey[1]
 join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
 where con.contype='f' and con.confrelid='auth.users'::regclass and array_length(con.conkey,1)=1 and n.nspname in ('public','private') loop
  execute format('select exists(select 1 from %s where %I=$1)',a.conrelid::regclass,a.attname) into has_reference using r.user_id;
  if has_reference then raise exception 'account_deletion_uncovered_reference' using errcode='55000'; end if;
 end loop;
 set constraints all immediate;
 delete from private.account_deletion_context where transaction_id=txid_current();
 update private.account_deletion_requests set status='database_deleted',database_deleted_at=clock_timestamp() where request_id=p_request_id returning * into r;
 return private.account_deletion_result(r);
end; $$;
create function public.account_deletion_complete(p_request_id uuid,p_capability_hash text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare r private.account_deletion_requests;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'account_deletion_requires_read_committed' using errcode='55000';
 end if;
 perform pg_advisory_xact_lock(410041,1);
 r:=private.account_deletion_receipt(p_request_id,p_capability_hash);
 if r.status='complete' then return private.account_deletion_result(r); end if;
 if r.status<>'database_deleted' or exists(select 1 from auth.users where id=r.user_id) then raise exception 'account_deletion_auth_pending' using errcode='55000'; end if;
 update private.account_deletion_requests set status='complete',completed_at=clock_timestamp() where request_id=p_request_id returning * into r;
 return private.account_deletion_result(r);
end; $$;

do $$ declare f record; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname like 'account_deletion_%' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.oid::regprocedure);
  if (select n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.oid=f.oid)='public' then
   execute format('grant execute on function %s to service_role',f.oid::regprocedure);
  end if;
 end loop;
end; $$;
commit;
