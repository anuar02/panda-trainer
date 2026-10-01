begin;

create table private.booking_status_command_receipts (
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  request_id uuid not null,
  command text not null check (command in ('confirm', 'cancel')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_user_id, request_id)
);
alter table private.booking_status_command_receipts enable row level security;
revoke all on private.booking_status_command_receipts from public, anon, authenticated;

create function private.apply_booking_status_command(
  p_command text,
  p_booking_id uuid,
  p_expected_revision integer,
  p_request_id uuid
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
    return v_receipt.result || jsonb_build_object('replayed', true);
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

create function public.confirm_booking(
  p_booking_id uuid,
  p_expected_revision integer,
  p_request_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select private.apply_booking_status_command('confirm', p_booking_id, p_expected_revision, p_request_id);
$$;

create function public.cancel_booking(
  p_booking_id uuid,
  p_expected_revision integer,
  p_request_id uuid
)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select private.apply_booking_status_command('cancel', p_booking_id, p_expected_revision, p_request_id);
$$;

revoke all on function private.apply_booking_status_command(text, uuid, integer, uuid) from public, anon, authenticated;
revoke all on function public.confirm_booking(uuid, integer, uuid) from public, anon;
revoke all on function public.cancel_booking(uuid, integer, uuid) from public, anon;
grant execute on function public.confirm_booking(uuid, integer, uuid) to authenticated;
grant execute on function public.cancel_booking(uuid, integer, uuid) to authenticated;

commit;
