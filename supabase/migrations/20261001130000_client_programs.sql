begin;

create table private.program_assignment_receipts (
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
alter table private.program_assignment_receipts enable row level security;
revoke all on private.program_assignment_receipts from public, anon, authenticated;

create table public.client_programs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  client_record_id uuid not null,
  base_template_id uuid not null,
  base_template_revision integer not null check (base_template_revision > 0),
  name text not null check (length(btrim(name)) between 1 and 80),
  description text not null default '' check (length(description) <= 400),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  foreign key (workspace_id, client_record_id)
    references public.client_records (workspace_id, id) on delete restrict,
  foreign key (workspace_id, base_template_id)
    references public.workout_templates (workspace_id, id) on delete restrict
);

create index client_programs_client_idx
on public.client_programs (workspace_id, client_record_id, created_at desc);

create table public.client_program_exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  client_program_id uuid not null,
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
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, client_program_id, position) deferrable initially deferred,
  unique (workspace_id, client_program_id, exercise_id),
  foreign key (workspace_id, client_program_id)
    references public.client_programs (workspace_id, id) on delete restrict,
  foreign key (workspace_id, exercise_id)
    references public.exercises (workspace_id, id) on delete restrict,
  check ((planned_reps is not null) <> (planned_seconds is not null)),
  check (planned_reps is null or planned_reps ~ '^[0-9]{1,3}([–-][0-9]{1,3})?$'),
  check (planned_seconds is null or planned_seconds ~ '^[0-9]{1,4}([–-][0-9]{1,4})?$'),
  check ((measure_snapshot = 'reps' and planned_reps is not null)
      or (measure_snapshot = 'seconds' and planned_seconds is not null))
);

create index client_program_exercises_program_idx
on public.client_program_exercises (workspace_id, client_program_id, position);

create trigger client_programs_touch_updated_at before update on public.client_programs
for each row execute function public.touch_updated_at();
create trigger client_program_exercises_touch_updated_at before update on public.client_program_exercises
for each row execute function public.touch_updated_at();

alter table public.client_programs enable row level security;
alter table public.client_program_exercises enable row level security;

create policy client_programs_read on public.client_programs
for select to authenticated using (
  public.is_workspace_owner(workspace_id)
  or client_record_id in (select public.my_client_record_ids())
);
create policy client_program_exercises_read on public.client_program_exercises
for select to authenticated using (
  exists (
    select 1 from public.client_programs p
    where p.workspace_id = client_program_exercises.workspace_id
      and p.id = client_program_exercises.client_program_id
      and (public.is_workspace_owner(p.workspace_id)
        or p.client_record_id in (select public.my_client_record_ids()))
  )
);

revoke all on public.client_programs, public.client_program_exercises from public, anon, authenticated;
grant select on public.client_programs, public.client_program_exercises to authenticated;

create function public.assign_client_program(
  p_client_record_id uuid,
  p_template_id uuid,
  p_expected_template_revision integer,
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
  v_receipt private.program_assignment_receipts%rowtype;
  v_payload jsonb;
  v_client public.client_records%rowtype;
  v_template public.workout_templates%rowtype;
  v_program_id uuid;
  v_revision integer;
  v_item_count integer;
  v_locked_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select w.id into v_workspace_id from public.trainer_workspaces w where w.owner_user_id = v_user_id;
  if v_workspace_id is null then raise exception 'Workspace not found' using errcode = '42501'; end if;
  perform 1 from public.trainer_workspaces w where w.id = v_workspace_id for update;
  if p_request_id is null then raise exception 'request_id is required' using errcode = '22023'; end if;
  v_payload := jsonb_build_object('client_record_id', p_client_record_id,
    'template_id', p_template_id, 'expected_template_revision', p_expected_template_revision);
  select * into v_receipt from private.program_assignment_receipts r
    where r.workspace_id = v_workspace_id and r.request_id = p_request_id;
  if found then
    if v_receipt.payload <> v_payload then
      raise exception 'Request id was already used with a different payload' using errcode = '22023';
    end if;
    return v_receipt.result || jsonb_build_object('replayed', true);
  end if;
  if p_expected_template_revision is null then
    raise exception 'expected_template_revision is required' using errcode = '22023';
  end if;
  select * into v_template from public.workout_templates t
    where t.workspace_id = v_workspace_id and t.id = p_template_id for update;
  if not found or v_template.archived_at is not null then
    raise exception 'Template unavailable' using errcode = 'P0002';
  end if;
  if v_template.revision <> p_expected_template_revision then
    raise exception 'Template revision is stale' using errcode = '40001';
  end if;
  select * into v_client from public.client_records c
    where c.workspace_id = v_workspace_id and c.id = p_client_record_id for update;
  if not found or v_client.archived_at is not null then
    raise exception 'Client unavailable' using errcode = 'P0002';
  end if;
  select count(*)::integer into v_item_count from public.template_exercises te
    where te.workspace_id = v_workspace_id and te.template_id = v_template.id;
  if v_item_count not between 1 and 50 then
    raise exception 'Template must contain 1 to 50 exercises' using errcode = '23514';
  end if;
  perform e.id from public.exercises e
    join public.template_exercises te on te.workspace_id = e.workspace_id and te.exercise_id = e.id
    where te.workspace_id = v_workspace_id and te.template_id = v_template.id
    order by e.id for share of e;
  get diagnostics v_locked_count = row_count;
  if v_locked_count <> v_item_count then
    raise exception 'Template contains unavailable exercises' using errcode = '23503';
  end if;
  insert into public.client_programs (workspace_id, client_record_id, base_template_id,
    base_template_revision, name, description, created_by)
  values (v_workspace_id, v_client.id, v_template.id, v_template.revision,
    v_template.name, v_template.description, v_user_id)
  returning id, revision into v_program_id, v_revision;
  insert into public.client_program_exercises (workspace_id, client_program_id, exercise_id,
    exercise_name_snapshot, measure_snapshot, bodyweight_snapshot, muscle_group_snapshot,
    equipment_snapshot, instructions_snapshot, source_key_snapshot, position, planned_sets,
    planned_reps, planned_seconds, planned_weight_g, rest_seconds, note, created_by)
  select v_workspace_id, v_program_id, e.id, e.name, e.measure, e.bodyweight,
    e.muscle_group, e.equipment, e.instructions, e.source_key, te.position,
    te.planned_sets, te.planned_reps, te.planned_seconds, te.planned_weight_g,
    te.rest_seconds, te.note, v_user_id
  from public.template_exercises te
  join public.exercises e on e.workspace_id = te.workspace_id and e.id = te.exercise_id
  where te.workspace_id = v_workspace_id and te.template_id = v_template.id
  order by te.position;
  v_payload := jsonb_build_object('client_record_id', p_client_record_id,
    'template_id', p_template_id, 'expected_template_revision', p_expected_template_revision);
  insert into private.program_assignment_receipts (workspace_id, request_id, payload, result)
    values (v_workspace_id, p_request_id, v_payload,
      jsonb_build_object('id', v_program_id, 'revision', v_revision));
  return jsonb_build_object('id', v_program_id, 'revision', v_revision, 'replayed', false);
end;
$$;

revoke all on function public.assign_client_program(uuid, uuid, integer, uuid) from public, anon;
grant execute on function public.assign_client_program(uuid, uuid, integer, uuid) to authenticated;

commit;
