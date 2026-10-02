begin;

create table private.booking_reschedule_receipts (
  workspace_id uuid not null references public.trainer_workspaces(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key(workspace_id, actor_user_id, request_id)
);
alter table private.booking_reschedule_receipts enable row level security;
revoke all on private.booking_reschedule_receipts from public, anon, authenticated;

create function private.apply_booking_reschedule_command(
  p_command text, p_booking_id uuid, p_proposal_id uuid,
  p_expected_booking_revision integer, p_expected_proposal_revision integer,
  p_proposed_starts_at timestamptz, p_request_id uuid
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
    return v_receipt.result || jsonb_build_object('replayed',true);
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
revoke all on function private.apply_booking_reschedule_command(text,uuid,uuid,integer,integer,timestamptz,uuid) from public,anon,authenticated;

create function public.propose_booking_reschedule(p_booking_id uuid, p_expected_booking_revision integer, p_proposed_starts_at timestamptz, p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.apply_booking_reschedule_command('propose',p_booking_id,null,p_expected_booking_revision,null,p_proposed_starts_at,p_request_id); $$;
revoke all on function public.propose_booking_reschedule(uuid,integer,timestamptz,uuid) from public,anon;
grant execute on function public.propose_booking_reschedule(uuid,integer,timestamptz,uuid) to authenticated;

create function public.counter_booking_reschedule(p_proposal_id uuid, p_expected_proposal_revision integer, p_expected_booking_revision integer, p_proposed_starts_at timestamptz, p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.apply_booking_reschedule_command('counter',null,p_proposal_id,p_expected_booking_revision,p_expected_proposal_revision,p_proposed_starts_at,p_request_id); $$;
revoke all on function public.counter_booking_reschedule(uuid,integer,integer,timestamptz,uuid) from public,anon;
grant execute on function public.counter_booking_reschedule(uuid,integer,integer,timestamptz,uuid) to authenticated;

create function public.accept_booking_reschedule(p_proposal_id uuid, p_expected_proposal_revision integer, p_expected_booking_revision integer, p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.apply_booking_reschedule_command('accept',null,p_proposal_id,p_expected_booking_revision,p_expected_proposal_revision,null,p_request_id); $$;
revoke all on function public.accept_booking_reschedule(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.accept_booking_reschedule(uuid,integer,integer,uuid) to authenticated;

create function public.decline_booking_reschedule(p_proposal_id uuid, p_expected_proposal_revision integer, p_expected_booking_revision integer, p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.apply_booking_reschedule_command('decline',null,p_proposal_id,p_expected_booking_revision,p_expected_proposal_revision,null,p_request_id); $$;
revoke all on function public.decline_booking_reschedule(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.decline_booking_reschedule(uuid,integer,integer,uuid) to authenticated;

create function public.withdraw_booking_reschedule(p_proposal_id uuid, p_expected_proposal_revision integer, p_expected_booking_revision integer, p_request_id uuid)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select private.apply_booking_reschedule_command('withdraw',null,p_proposal_id,p_expected_booking_revision,p_expected_proposal_revision,null,p_request_id); $$;
revoke all on function public.withdraw_booking_reschedule(uuid,integer,integer,uuid) from public,anon;
grant execute on function public.withdraw_booking_reschedule(uuid,integer,integer,uuid) to authenticated;

commit;
