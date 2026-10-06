begin;

create table public.booking_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  booking_id uuid not null,
  base_template_id uuid not null,
  base_template_revision integer not null check (base_template_revision > 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 400),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, booking_id),
  foreign key (workspace_id, booking_id)
    references public.bookings (workspace_id, id) on delete restrict,
  foreign key (workspace_id, base_template_id)
    references public.workout_templates (workspace_id, id) on delete restrict
);

create table public.booking_program_exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  booking_program_id uuid not null,
  exercise_id uuid not null,
  exercise_name_snapshot text not null check (length(btrim(exercise_name_snapshot)) between 1 and 120),
  measure_snapshot text not null check (measure_snapshot in ('reps', 'seconds')),
  bodyweight_snapshot boolean not null,
  muscle_group_snapshot text not null,
  equipment_snapshot text not null,
  instructions_snapshot text[] not null,
  source_key_snapshot text,
  position integer not null check (position between 0 and 49),
  planned_sets integer not null check (planned_sets between 1 and 20),
  planned_reps text,
  planned_seconds text,
  planned_weight_g integer check (planned_weight_g between 0 and 1000000),
  rest_seconds integer not null default 0 check (rest_seconds between 0 and 600),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, booking_program_id, position) deferrable initially deferred,
  unique (workspace_id, booking_program_id, exercise_id),
  foreign key (workspace_id, booking_program_id)
    references public.booking_programs (workspace_id, id) on delete restrict,
  foreign key (workspace_id, exercise_id)
    references public.exercises (workspace_id, id) on delete restrict,
  check ((planned_reps is not null) <> (planned_seconds is not null)),
  check (planned_reps is null or planned_reps ~ '^[0-9]{1,3}([–-][0-9]{1,3})?$'),
  check (planned_seconds is null or planned_seconds ~ '^[0-9]{1,4}([–-][0-9]{1,4})?$'),
  check ((measure_snapshot = 'reps' and planned_reps is not null)
      or (measure_snapshot = 'seconds' and planned_seconds is not null))
);

create index booking_program_exercises_program_idx
on public.booking_program_exercises (workspace_id, booking_program_id, position);

alter table public.booking_programs enable row level security;
alter table public.booking_program_exercises enable row level security;

create policy booking_programs_read on public.booking_programs
for select to authenticated using (
  exists (select 1 from public.bookings b
    where b.workspace_id = booking_programs.workspace_id and b.id = booking_programs.booking_id)
);
create policy booking_program_exercises_read on public.booking_program_exercises
for select to authenticated using (
  exists (select 1 from public.booking_programs p
    where p.workspace_id = booking_program_exercises.workspace_id and p.id = booking_program_exercises.booking_program_id)
);

revoke all on public.booking_programs, public.booking_program_exercises from public, anon, authenticated;
grant select (id, workspace_id, booking_id, base_template_id, base_template_revision,
  name, description, created_at) on public.booking_programs to authenticated;
grant select (id, workspace_id, booking_program_id, exercise_id, exercise_name_snapshot,
  measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot,
  instructions_snapshot, source_key_snapshot, position, planned_sets, planned_reps,
  planned_seconds, planned_weight_g, rest_seconds, note, created_at)
  on public.booking_program_exercises to authenticated;

create function public.create_booking_set_with_plan(
  p_client_record_ids uuid[],
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_collision_ack boolean,
  p_request_id uuid,
  p_template_id uuid,
  p_expected_template_revision integer
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
  v_template public.workout_templates%rowtype;
  v_item_count integer;
  v_locked_count integer;
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
  if (p_template_id is null) <> (p_expected_template_revision is null)
     or p_expected_template_revision < 1 then
    raise exception using errcode = '22023', message = 'invalid template selection';
  end if;
  if p_template_id is not null then
    v_payload := v_payload || jsonb_build_object('template_id', p_template_id,
      'expected_template_revision', p_expected_template_revision);
  end if;
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

  if p_template_id is not null then
    select t.* into v_template from public.workout_templates t
      where t.workspace_id = v_workspace_id and t.id = p_template_id for update;
    if not found or v_template.archived_at is not null then
      raise exception using errcode = 'P0002', message = 'Template unavailable';
    end if;
    if v_template.revision <> p_expected_template_revision then
      raise exception using errcode = '40001', message = 'Template revision is stale';
    end if;
    select count(*)::integer into v_item_count from public.template_exercises te
      where te.workspace_id = v_workspace_id and te.template_id = v_template.id;
    if v_item_count not between 1 and 50 then
      raise exception using errcode = '23514', message = 'Template must contain 1 to 50 exercises';
    end if;
    perform e.id from public.exercises e join public.template_exercises te
      on te.workspace_id = e.workspace_id and te.exercise_id = e.id
      where te.workspace_id = v_workspace_id and te.template_id = v_template.id
      and e.archived_at is null order by e.id for share of e;
    get diagnostics v_locked_count = row_count;
    if v_locked_count <> v_item_count then
      raise exception using errcode = '23503', message = 'Template contains unavailable exercises';
    end if;
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

  if p_template_id is not null then
    insert into public.booking_programs (workspace_id, booking_id, base_template_id,
      base_template_revision, name, description, created_by)
    select v_workspace_id, booking_id, v_template.id, v_template.revision,
      v_template.name, v_template.description, v_user_id
    from unnest(v_booking_ids) requested(booking_id);
    insert into public.booking_program_exercises (workspace_id, booking_program_id, exercise_id,
      exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot,
      equipment_snapshot, instructions_snapshot, source_key_snapshot, position, planned_sets,
      planned_reps, planned_seconds, planned_weight_g, rest_seconds, note, created_by)
    select v_workspace_id, p.id, e.id, e.name, e.measure, e.bodyweight,
      e.muscle_group, e.equipment, e.instructions, e.source_key, te.position,
      te.planned_sets, te.planned_reps, te.planned_seconds, te.planned_weight_g,
      te.rest_seconds, te.note, v_user_id
    from public.booking_programs p
    join public.template_exercises te on te.workspace_id = p.workspace_id and te.template_id = v_template.id
    join public.exercises e on e.workspace_id = te.workspace_id and e.id = te.exercise_id
    where p.workspace_id = v_workspace_id and p.booking_id = any(v_booking_ids);
  end if;

  return jsonb_build_object(
    'created', true, 'group_session_id', v_group_session_id,
    'booking_ids', to_jsonb(v_booking_ids), 'overlaps', v_overlaps,
    'replayed', false
  );
end;
$$;

create or replace function public.create_booking_set(
  p_client_record_ids uuid[], p_starts_at timestamptz, p_ends_at timestamptz,
  p_collision_ack boolean, p_request_id uuid
)
returns jsonb language sql security definer set search_path = pg_catalog
as $$
  select public.create_booking_set_with_plan(p_client_record_ids, p_starts_at,
    p_ends_at, p_collision_ack, p_request_id, null, null);
$$;
revoke all on function public.create_booking_set_with_plan(uuid[], timestamptz, timestamptz, boolean, uuid, uuid, integer) from public, anon;
grant execute on function public.create_booking_set_with_plan(uuid[], timestamptz, timestamptz, boolean, uuid, uuid, integer) to authenticated;

commit;
