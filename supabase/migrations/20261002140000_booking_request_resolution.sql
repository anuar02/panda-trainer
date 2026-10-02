begin;

create table private.booking_command_abandonments (
  workspace_id uuid not null references public.trainer_workspaces(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_family text not null check (command_family in ('status','reschedule')),
  request_id uuid not null,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  primary key(workspace_id,actor_user_id,command_family,request_id)
);
alter table private.booking_command_abandonments enable row level security;
revoke all on private.booking_command_abandonments from public,anon,authenticated;

create function private.booking_request_resolution(
  p_family text,p_workspace uuid,p_booking uuid,p_request uuid,p_payload jsonb,p_result jsonb
) returns jsonb language sql immutable set search_path=pg_catalog
as $$ select jsonb_build_object('outcome',case when p_result is null then 'abandoned' else 'succeeded' end,
  'command_family',p_family,'workspace_id',p_workspace,'booking_id',p_booking,
  'request_id',p_request,'canonical_payload',p_payload,'result',p_result); $$;
revoke all on function private.booking_request_resolution(text,uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;

create function private.perform_booking_status_command(
  p_command text,
  p_booking_id uuid,
  p_expected_revision integer,
  p_request_id uuid,
  p_resolve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_is_owner boolean;
  v_role text;
  v_booking public.bookings%rowtype;
  v_receipt private.booking_status_command_receipts%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_status text;
  v_revision integer;
  v_abandoned_payload jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_command is null or p_command not in ('confirm', 'cancel') or p_booking_id is null
     or p_expected_revision is null or p_expected_revision < 1 or p_request_id is null then
    raise exception 'Invalid booking status command' using errcode = '22023';
  end if;

  select b.workspace_id
    into v_workspace_id
  from public.bookings b
  join public.trainer_workspaces w on w.id = b.workspace_id
  join public.client_records c on c.workspace_id = b.workspace_id and c.id = b.client_record_id
  where b.id = p_booking_id
    and (w.owner_user_id = v_user_id or c.user_id = v_user_id);
  if not found then
    raise exception 'Booking unavailable' using errcode = 'P0002';
  end if;

  perform 1 from public.trainer_workspaces w
    where w.id = v_workspace_id for update;

  select b.*
    into v_booking
  from public.bookings b
  join public.trainer_workspaces w on w.id = b.workspace_id
  join public.client_records c on c.workspace_id = b.workspace_id and c.id = b.client_record_id
  where b.id = p_booking_id and b.workspace_id = v_workspace_id
    and (w.owner_user_id = v_user_id or c.user_id = v_user_id)
  for update of b;
  if not found then
    raise exception 'Booking unavailable' using errcode = 'P0002';
  end if;

  select w.owner_user_id = v_user_id into v_is_owner
  from public.trainer_workspaces w where w.id = v_workspace_id;
  if v_is_owner then
    v_role := 'trainer';
  else
    select exists (
      select 1 from public.client_records c
      where c.workspace_id = v_workspace_id
        and c.id = v_booking.client_record_id
        and c.user_id = v_user_id
    ) into v_is_owner;
    if not v_is_owner then
      raise exception 'Booking unavailable' using errcode = 'P0002';
    end if;
    v_role := 'client';
  end if;

  if p_command = 'confirm' and v_role <> 'client' then
    raise exception 'Only the linked client can confirm this booking' using errcode = '42501';
  end if;
  v_payload := jsonb_build_object(
    'command', p_command,
    'booking_id', p_booking_id,
    'expected_revision', p_expected_revision
  );
  select * into v_receipt
  from private.booking_status_command_receipts r
  where r.workspace_id = v_workspace_id
    and r.actor_user_id = v_user_id
    and r.request_id = p_request_id;
  if found then
    if v_receipt.command <> p_command or v_receipt.payload <> v_payload then
      raise exception 'Request id was already used with a different command or payload' using errcode = '22023';
    end if;
    if p_resolve then
      return private.booking_request_resolution('status', v_workspace_id, p_booking_id, p_request_id, v_payload, v_receipt.result || jsonb_build_object('replayed', true));
    end if;
    return v_receipt.result || jsonb_build_object('replayed', true);
  end if;

  select t.payload into v_abandoned_payload from private.booking_command_abandonments t
    where t.workspace_id=v_workspace_id and t.actor_user_id=v_user_id
      and t.command_family='status' and t.request_id=p_request_id;
  if found then
    if v_abandoned_payload<>v_payload then
      raise exception 'Request payload mismatch' using errcode='22023';
    end if;
    if p_resolve then
      return private.booking_request_resolution('status',v_workspace_id,p_booking_id,p_request_id,v_payload,null);
    end if;
    raise exception 'Request was abandoned' using errcode='55000';
  end if;
  if p_resolve then
    insert into private.booking_command_abandonments(workspace_id,actor_user_id,command_family,request_id,booking_id,payload)
      values(v_workspace_id,v_user_id,'status',p_request_id,p_booking_id,v_payload);
    return private.booking_request_resolution('status',v_workspace_id,p_booking_id,p_request_id,v_payload,null);
  end if;

  if v_booking.revision <> p_expected_revision then
    raise exception 'Booking revision is stale' using errcode = '40001';
  end if;
  if exists (
    select 1 from public.workout_instances wi
    where wi.workspace_id = v_workspace_id
      and wi.booking_id = p_booking_id
      and wi.finished_at is not null
  ) then
    raise exception 'A finished workout cannot change booking status' using errcode = '55000';
  end if;

  if p_command = 'confirm' then
    if v_booking.status <> 'proposed' then
      raise exception 'Only a proposed booking can be confirmed' using errcode = '55000';
    end if;
    v_status := 'confirmed';
  else
    if v_booking.status not in ('proposed', 'confirmed') then
      raise exception 'Booking is already cancelled' using errcode = '55000';
    end if;
    v_status := case when v_role = 'client' then 'cancelled_by_client' else 'cancelled_by_trainer' end;
  end if;

  update public.bookings b set status = v_status
  where b.workspace_id = v_workspace_id and b.id = p_booking_id
  returning b.revision into v_revision;

  if p_command = 'cancel' then
    update public.schedule_proposals p set status = 'withdrawn'
    where p.workspace_id = v_workspace_id and p.booking_id = p_booking_id and p.status = 'pending';
  end if;

  v_result := jsonb_build_object(
    'booking_id', p_booking_id,
    'revision', v_revision,
    'status', v_status
  );
  insert into private.booking_status_command_receipts
    (workspace_id, actor_user_id, request_id, command, payload, result)
  values (v_workspace_id, v_user_id, p_request_id, p_command, v_payload, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

create function private.perform_booking_reschedule_command(
  p_command text, p_booking_id uuid, p_proposal_id uuid,
  p_expected_booking_revision integer, p_expected_proposal_revision integer,
  p_proposed_starts_at timestamptz, p_request_id uuid, p_resolve boolean
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_actor uuid := auth.uid();
  v_workspace uuid;
  v_booking_id uuid;
  v_booking public.bookings%rowtype;
  v_proposal public.schedule_proposals%rowtype;
  v_receipt private.booking_reschedule_receipts%rowtype;
  v_payload jsonb;
  v_result jsonb;
  v_timezone text;
  v_end timestamptz;
  v_abandoned_payload jsonb;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_command is null or p_command not in ('propose','counter','accept','decline','withdraw')
    or p_request_id is null or p_expected_booking_revision is null or p_expected_booking_revision < 1
    or (p_command='propose' and (p_booking_id is null or p_proposal_id is not null or p_expected_proposal_revision is not null))
    or (p_command<>'propose' and (p_proposal_id is null or p_booking_id is not null or p_expected_proposal_revision is null or p_expected_proposal_revision < 1))
    or ((p_command in ('propose','counter')) <> (p_proposed_starts_at is not null)) then
    raise exception 'Invalid reschedule command' using errcode='22023';
  end if;
  select b.id,b.workspace_id into v_booking_id,v_workspace from public.bookings b
    join public.trainer_workspaces w on w.id=b.workspace_id
    join public.client_records c on c.workspace_id=b.workspace_id and c.id=b.client_record_id
    where b.id=case when p_command='propose' then p_booking_id else
      (select p.booking_id from public.schedule_proposals p where p.id=p_proposal_id) end
    and (w.owner_user_id=v_actor or c.user_id=v_actor);
  if not found then raise exception 'Booking unavailable' using errcode='P0002'; end if;
  select w.timezone into v_timezone from public.trainer_workspaces w where w.id=v_workspace for update;
  select b.* into v_booking from public.bookings b
    join public.trainer_workspaces w on w.id=b.workspace_id
    join public.client_records c on c.workspace_id=b.workspace_id and c.id=b.client_record_id
    where b.id=v_booking_id and b.workspace_id=v_workspace
    and (w.owner_user_id=v_actor or c.user_id=v_actor) for update of b;
  if not found then raise exception 'Booking unavailable' using errcode='P0002'; end if;
  v_payload:=jsonb_build_object('command',p_command,'booking_id',p_booking_id,'proposal_id',p_proposal_id,
    'expected_booking_revision',p_expected_booking_revision,'expected_proposal_revision',p_expected_proposal_revision,
    'proposed_starts_epoch',extract(epoch from p_proposed_starts_at));
  select r.* into v_receipt from private.booking_reschedule_receipts r
    where r.workspace_id=v_workspace and r.actor_user_id=v_actor and r.request_id=p_request_id;
  if found then
    if v_receipt.payload<>v_payload then raise exception 'Request payload mismatch' using errcode='22023'; end if;
    if p_resolve then
      return private.booking_request_resolution('reschedule', v_workspace, v_booking_id, p_request_id, v_payload, v_receipt.result || jsonb_build_object('replayed',true));
    end if;
    return v_receipt.result || jsonb_build_object('replayed',true);
  end if;
  select t.payload into v_abandoned_payload from private.booking_command_abandonments t
    where t.workspace_id=v_workspace and t.actor_user_id=v_actor
      and t.command_family='reschedule' and t.request_id=p_request_id;
  if found then
    if v_abandoned_payload<>v_payload then
      raise exception 'Request payload mismatch' using errcode='22023';
    end if;
    if p_resolve then
      return private.booking_request_resolution('reschedule',v_workspace,v_booking_id,p_request_id,v_payload,null);
    end if;
    raise exception 'Request was abandoned' using errcode='55000';
  end if;
  if p_resolve and p_command<>'propose' then
    select p.* into v_proposal from public.schedule_proposals p
      where p.workspace_id=v_workspace and p.booking_id=v_booking_id and p.id=p_proposal_id for update;
    if not found then raise exception 'Proposal unavailable' using errcode='P0002'; end if;
    if (p_command='withdraw' and v_proposal.author_user_id<>v_actor)
      or (p_command<>'withdraw' and v_proposal.author_user_id=v_actor) then
      raise exception 'Wrong responding role' using errcode='42501';
    end if;
  end if;
  if p_resolve then
    insert into private.booking_command_abandonments(workspace_id,actor_user_id,command_family,request_id,booking_id,payload)
      values(v_workspace,v_actor,'reschedule',p_request_id,v_booking_id,v_payload);
    return private.booking_request_resolution('reschedule',v_workspace,v_booking_id,p_request_id,v_payload,null);
  end if;

  if v_booking.revision<>p_expected_booking_revision then raise exception 'Booking revision is stale' using errcode='40001'; end if;
  if v_booking.status not in ('proposed','confirmed') or exists(select 1 from public.workout_instances wi
    where wi.workspace_id=v_workspace and wi.booking_id=v_booking_id and wi.finished_at is not null) then
    raise exception 'Booking cannot be rescheduled' using errcode='55000';
  end if;
  if p_command='propose' then
    select p.* into v_proposal from public.schedule_proposals p
      where p.workspace_id=v_workspace and p.booking_id=v_booking_id and p.status='pending' for update;
    if found then
      if v_proposal.base_revision=v_booking.revision then raise exception 'Proposal already pending' using errcode='55000'; end if;
      update public.schedule_proposals set status='stale' where id=v_proposal.id;
    end if;
  else
    select p.* into v_proposal from public.schedule_proposals p
      where p.workspace_id=v_workspace and p.booking_id=v_booking_id and p.id=p_proposal_id for update;
    if not found then raise exception 'Proposal unavailable' using errcode='P0002'; end if;
    if v_proposal.revision<>p_expected_proposal_revision then raise exception 'Proposal revision is stale' using errcode='40001'; end if;
    if v_proposal.status<>'pending' then raise exception 'Proposal no longer pending' using errcode='55000'; end if;
    if (p_command='withdraw' and v_proposal.author_user_id<>v_actor)
      or (p_command<>'withdraw' and v_proposal.author_user_id=v_actor) then
      raise exception 'Wrong responding role' using errcode='42501';
    end if;
    if p_command<>'withdraw' and v_proposal.base_revision<>v_booking.revision then
      raise exception 'Proposal booking revision is stale' using errcode='40001';
    end if;
  end if;
  if p_command in ('propose','counter','accept') then
    if not exists(select 1 from pg_catalog.pg_timezone_names z where z.name=v_timezone) then
      raise exception 'Invalid workspace timezone' using errcode='22023';
    end if;
    if p_command='accept' then p_proposed_starts_at:=v_proposal.proposed_starts_at; end if;
    v_end:=p_proposed_starts_at+(v_booking.ends_at-v_booking.starts_at);
    if not isfinite(p_proposed_starts_at) or p_proposed_starts_at<=clock_timestamp()
      or p_proposed_starts_at=v_booking.starts_at or v_end<=p_proposed_starts_at
      or v_end>((((p_proposed_starts_at at time zone v_timezone)::date+1)::timestamp) at time zone v_timezone) then
      raise exception 'Invalid reschedule target' using errcode='22023';
    end if;
  end if;
  if p_command='propose' then
    insert into public.schedule_proposals(workspace_id,booking_id,author_user_id,proposed_starts_at,
      proposed_ends_at,base_revision,created_by)
    values(v_workspace,v_booking_id,v_actor,p_proposed_starts_at,v_end,v_booking.revision,v_actor)
    returning * into v_proposal;
  elsif p_command='counter' then
    update public.schedule_proposals set author_user_id=v_actor,proposed_starts_at=p_proposed_starts_at,
      proposed_ends_at=v_end where id=v_proposal.id returning * into v_proposal;
  else
    if p_command='accept' then
      update public.bookings set starts_at=p_proposed_starts_at,ends_at=v_end,group_session_id=null
        where id=v_booking_id returning * into v_booking;
    end if;
    update public.schedule_proposals set status=case p_command when 'accept' then 'accepted'
      when 'decline' then 'declined' else 'withdrawn' end
      where id=v_proposal.id returning * into v_proposal;
  end if;
  v_result:=jsonb_build_object('proposal_id',v_proposal.id,'proposal_revision',v_proposal.revision,
    'proposal_status',v_proposal.status,'booking_id',v_booking.id,'booking_revision',v_booking.revision,
    'booking_status',v_booking.status,'starts_at',v_booking.starts_at,'ends_at',v_booking.ends_at);
  insert into private.booking_reschedule_receipts(workspace_id,actor_user_id,request_id,payload,result)
    values(v_workspace,v_actor,p_request_id,v_payload,v_result);
  return v_result || jsonb_build_object('replayed',false);
end;
$$;
revoke all on function private.perform_booking_status_command(text,uuid,integer,uuid,boolean) from public,anon,authenticated;
revoke all on function private.perform_booking_reschedule_command(text,uuid,uuid,integer,integer,timestamptz,uuid,boolean) from public,anon,authenticated;

create or replace function private.apply_booking_status_command(p_command text,p_booking_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.perform_booking_status_command(p_command,p_booking_id,p_expected_revision,p_request_id,false); $$;
create or replace function private.apply_booking_reschedule_command(p_command text,p_booking_id uuid,p_proposal_id uuid,
  p_expected_booking_revision integer,p_expected_proposal_revision integer,p_proposed_starts_at timestamptz,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.perform_booking_reschedule_command(p_command,p_booking_id,p_proposal_id,
  p_expected_booking_revision,p_expected_proposal_revision,p_proposed_starts_at,p_request_id,false); $$;

create function public.resolve_booking_status_request(p_command text,p_booking_id uuid,p_expected_revision integer,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.perform_booking_status_command(p_command,p_booking_id,p_expected_revision,p_request_id,true); $$;
create function public.resolve_booking_reschedule_request(p_command text,p_booking_id uuid,p_proposal_id uuid,
  p_expected_booking_revision integer,p_expected_proposal_revision integer,p_proposed_starts_at timestamptz,p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.perform_booking_reschedule_command(p_command,p_booking_id,p_proposal_id,
  p_expected_booking_revision,p_expected_proposal_revision,p_proposed_starts_at,p_request_id,true); $$;
revoke all on function public.resolve_booking_status_request(text,uuid,integer,uuid) from public,anon;
revoke all on function public.resolve_booking_reschedule_request(text,uuid,uuid,integer,integer,timestamptz,uuid) from public,anon;
grant execute on function public.resolve_booking_status_request(text,uuid,integer,uuid) to authenticated;
grant execute on function public.resolve_booking_reschedule_request(text,uuid,uuid,integer,integer,timestamptz,uuid) to authenticated;

commit;
