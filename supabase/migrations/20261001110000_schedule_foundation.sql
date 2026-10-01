begin;

alter table public.client_records
  add constraint client_records_workspace_id_id_key unique (workspace_id, id);

create table public.group_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  check (ends_at > starts_at)
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  client_record_id uuid not null,
  group_session_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'confirmed', 'cancelled_by_client', 'cancelled_by_trainer')),
  revision integer not null default 1 check (revision > 0),
  request_id uuid,
  request_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, request_id),
  foreign key (workspace_id, client_record_id)
    references public.client_records (workspace_id, id) on delete restrict,
  foreign key (workspace_id, group_session_id)
    references public.group_sessions (workspace_id, id) on delete restrict,
  check (ends_at > starts_at),
  check ((request_id is null) = (request_payload is null)),
  check (request_payload is null or jsonb_typeof(request_payload) = 'object')
);

create table public.schedule_proposals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  booking_id uuid not null,
  author_user_id uuid not null default auth.uid() references auth.users (id),
  proposed_starts_at timestamptz not null,
  proposed_ends_at timestamptz not null,
  base_revision integer not null check (base_revision > 0),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'withdrawn', 'stale')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  foreign key (workspace_id, booking_id)
    references public.bookings (workspace_id, id) on delete restrict,
  check (proposed_ends_at > proposed_starts_at)
);

create index bookings_workspace_starts_at_idx
  on public.bookings (workspace_id, starts_at)
  where status in ('proposed', 'confirmed');
create index bookings_client_record_id_idx on public.bookings (client_record_id, starts_at desc);
create index bookings_group_session_id_idx on public.bookings (workspace_id, group_session_id)
  where group_session_id is not null;
create unique index schedule_proposals_one_pending_per_booking_idx
  on public.schedule_proposals (workspace_id, booking_id)
  where status = 'pending';
create index schedule_proposals_booking_status_idx
  on public.schedule_proposals (workspace_id, booking_id, status);

create trigger group_sessions_touch_updated_at before update on public.group_sessions
for each row execute function public.touch_updated_at();
create trigger bookings_touch_updated_at before update on public.bookings
for each row execute function public.touch_updated_at();
create trigger schedule_proposals_touch_updated_at before update on public.schedule_proposals
for each row execute function public.touch_updated_at();

alter table public.group_sessions enable row level security;
alter table public.bookings enable row level security;
alter table public.schedule_proposals enable row level security;

create policy group_sessions_read_owner_or_member on public.group_sessions
for select to authenticated
using (
  public.is_workspace_owner(workspace_id)
  or exists (
    select 1 from public.bookings b
    where b.workspace_id = group_sessions.workspace_id
      and b.group_session_id = group_sessions.id
  )
);

create policy bookings_read_owner_or_client on public.bookings
for select to authenticated
using (
  public.is_workspace_owner(workspace_id)
  or client_record_id in (select public.my_client_record_ids())
);

create policy schedule_proposals_read_via_booking on public.schedule_proposals
for select to authenticated
using (
  exists (
    select 1 from public.bookings b
    where b.workspace_id = schedule_proposals.workspace_id
      and b.id = schedule_proposals.booking_id
  )
);

revoke all on public.group_sessions, public.bookings, public.schedule_proposals
from public, anon, authenticated;
grant select (id, workspace_id, starts_at, ends_at, revision, created_at, updated_at)
  on public.group_sessions to authenticated;
grant select (id, workspace_id, client_record_id, group_session_id, starts_at, ends_at, status, revision, created_at, updated_at)
  on public.bookings to authenticated;
grant select (id, workspace_id, booking_id, author_user_id, proposed_starts_at, proposed_ends_at, base_revision, status, revision, created_at, updated_at)
  on public.schedule_proposals to authenticated;

create function public.create_booking_set(
  p_client_record_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_collision_ack boolean,
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
  v_timezone text;
  v_client_ids uuid[];
  v_payload jsonb;
  v_existing public.bookings%rowtype;
  v_group_session_id uuid;
  v_booking_ids uuid[];
  v_overlaps jsonb;
  v_now timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'trainer authentication required';
  end if;

  select w.id, w.timezone into v_workspace_id, v_timezone
  from public.trainer_workspaces w
  where w.owner_user_id = v_user_id
  for update;
  if v_workspace_id is null then
    raise exception using errcode = '42501', message = 'trainer workspace required';
  end if;

  if p_client_record_ids is null or cardinality(p_client_record_ids) = 0
     or p_starts_at is null or p_ends_at is null or p_collision_ack is null or p_request_id is null then
    raise exception using errcode = '22023', message = 'invalid booking request';
  end if;
  if cardinality(p_client_record_ids) <> (
    select count(distinct id) from unnest(p_client_record_ids) as requested(id)
  ) then
    raise exception using errcode = '22023', message = 'duplicate client record';
  end if;

  select array_agg(distinct id order by id) into v_client_ids
  from unnest(p_client_record_ids) as requested(id);
  v_payload := jsonb_build_object(
    'client_record_ids', to_jsonb(v_client_ids),
    'starts_epoch', extract(epoch from p_starts_at),
    'ends_epoch', extract(epoch from p_ends_at),
    'collision_ack', p_collision_ack
  );
  select b.* into v_existing
  from public.bookings b
  where b.workspace_id = v_workspace_id and b.request_id = p_request_id;
  if found then
    if v_existing.request_payload <> v_payload then
      raise exception using errcode = '22023', message = 'request id payload mismatch';
    end if;
    if v_existing.group_session_id is null then
      v_booking_ids := array[v_existing.id];
    else
      select array_agg(b.id order by b.client_record_id) into v_booking_ids
      from public.bookings b
      where b.workspace_id = v_workspace_id and b.group_session_id = v_existing.group_session_id;
    end if;
    return jsonb_build_object(
      'created', true, 'group_session_id', v_existing.group_session_id,
      'booking_ids', to_jsonb(v_booking_ids), 'overlaps', '[]'::jsonb,
      'replayed', true
    );
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_timezone) then
    raise exception using errcode = '22023', message = 'invalid workspace timezone';
  end if;

  v_now := clock_timestamp();
  if p_ends_at <= p_starts_at or p_starts_at <= v_now
     or p_ends_at > (((p_starts_at at time zone v_timezone)::date + 1)::timestamp at time zone v_timezone) then
    raise exception using errcode = '22023', message = 'invalid booking interval';
  end if;
  if cardinality(v_client_ids) <> (
    select count(*) from public.client_records c
    where c.workspace_id = v_workspace_id
      and c.archived_at is null
      and c.id = any (v_client_ids)
  ) then
    raise exception using errcode = '42501', message = 'client records unavailable';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'booking_ids', event.booking_ids,
    'starts_at', event.starts_at,
    'ends_at', event.ends_at
  ) order by event.starts_at), '[]'::jsonb)
  into v_overlaps
  from (
    select array_agg(b.id order by b.id) as booking_ids,
      min(b.starts_at) as starts_at, max(b.ends_at) as ends_at
    from public.bookings b
    where b.workspace_id = v_workspace_id
      and b.status in ('proposed', 'confirmed')
      and b.starts_at < p_ends_at and b.ends_at > p_starts_at
    group by b.group_session_id, case when b.group_session_id is null then b.id end
  ) event;

  if jsonb_array_length(v_overlaps) > 0 and not p_collision_ack then
    return jsonb_build_object(
      'created', false, 'requires_overlap_ack', true,
      'group_session_id', null, 'booking_ids', '[]'::jsonb,
      'overlaps', v_overlaps, 'replayed', false
    );
  end if;

  if cardinality(v_client_ids) > 1 then
    insert into public.group_sessions (workspace_id, starts_at, ends_at, created_by)
    values (v_workspace_id, p_starts_at, p_ends_at, v_user_id)
    returning id into v_group_session_id;
  end if;

  insert into public.bookings (
    workspace_id, client_record_id, group_session_id, starts_at, ends_at,
    status, request_id, request_payload, created_by
  )
  select v_workspace_id, client_id, v_group_session_id, p_starts_at, p_ends_at,
    'proposed', case when row_number() over (order by client_id) = 1 then p_request_id end,
    case when row_number() over (order by client_id) = 1 then v_payload end,
    v_user_id
  from unnest(v_client_ids) as requested(client_id);

  select array_agg(b.id order by b.client_record_id) into v_booking_ids
  from public.bookings b
  where b.workspace_id = v_workspace_id
    and (b.group_session_id = v_group_session_id or (v_group_session_id is null and b.request_id = p_request_id));

  return jsonb_build_object(
    'created', true, 'group_session_id', v_group_session_id,
    'booking_ids', to_jsonb(v_booking_ids), 'overlaps', v_overlaps,
    'replayed', false
  );
end;
$$;

revoke all on function public.create_booking_set(uuid[], timestamptz, timestamptz, boolean, uuid)
  from public, anon;
grant execute on function public.create_booking_set(uuid[], timestamptz, timestamptz, boolean, uuid)
  to authenticated;

commit;
