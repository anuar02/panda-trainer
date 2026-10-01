begin;

alter table public.bookings
  add constraint bookings_workspace_id_id_client_record_id_key
  unique (workspace_id, id, client_record_id);

alter table public.client_programs
  add constraint client_programs_workspace_id_id_client_record_id_key
  unique (workspace_id, id, client_record_id);

create table public.workout_instances (
  id uuid primary key,
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  booking_id uuid not null,
  client_record_id uuid not null,
  source_program_id uuid,
  source_program_revision integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, id, client_record_id),
  unique (workspace_id, booking_id),
  foreign key (workspace_id, booking_id, client_record_id)
    references public.bookings (workspace_id, id, client_record_id) on delete restrict,
  foreign key (workspace_id, source_program_id, client_record_id)
    references public.client_programs (workspace_id, id, client_record_id) on delete restrict,
  check ((source_program_id is null) = (source_program_revision is null)),
  check (source_program_revision is null or source_program_revision > 0)
);

create index workout_instances_client_idx
  on public.workout_instances (workspace_id, client_record_id, created_at desc);

create table public.workout_exercises (
  id uuid primary key,
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  workout_instance_id uuid not null,
  exercise_id uuid not null,
  exercise_name_snapshot text not null check (length(btrim(exercise_name_snapshot)) > 0),
  measure_snapshot text not null check (measure_snapshot in ('reps', 'seconds')),
  bodyweight_snapshot boolean not null,
  muscle_group_snapshot text not null,
  equipment_snapshot text not null,
  instructions_snapshot text[] not null,
  source_key_snapshot text,
  position integer not null check (position >= 0),
  planned_sets integer not null check (planned_sets >= 0),
  planned_reps text,
  planned_seconds text,
  planned_weight_g integer check (planned_weight_g between 0 and 1000000),
  rest_seconds integer not null default 0 check (rest_seconds between 0 and 600),
  note text,
  replaced_from_id uuid,
  skipped boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, workout_instance_id, id),
  unique (workspace_id, workout_instance_id, position),
  foreign key (workspace_id, workout_instance_id)
    references public.workout_instances (workspace_id, id) on delete restrict,
  foreign key (workspace_id, exercise_id)
    references public.exercises (workspace_id, id) on delete restrict,
  foreign key (workspace_id, workout_instance_id, replaced_from_id)
    references public.workout_exercises (workspace_id, workout_instance_id, id) on delete restrict,
  check (replaced_from_id is null or replaced_from_id <> id),
  check (planned_reps is null or planned_seconds is null),
  check (planned_reps is null or planned_reps ~ '^[0-9]{1,3}([–-][0-9]{1,3})?$'),
  check (planned_seconds is null or planned_seconds ~ '^[0-9]{1,4}([–-][0-9]{1,4})?$'),
  check (planned_reps is null or measure_snapshot = 'reps'),
  check (planned_seconds is null or measure_snapshot = 'seconds')
);

create index workout_exercises_instance_idx
  on public.workout_exercises (workspace_id, workout_instance_id, position);

create table public.set_results (
  id uuid primary key,
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  workout_instance_id uuid not null,
  workout_exercise_id uuid not null,
  position integer not null check (position >= 0),
  reps integer check (reps >= 0),
  seconds integer check (seconds >= 0),
  weight_g integer check (weight_g >= 0),
  author_user_id uuid not null references auth.users (id),
  device_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  unique (workspace_id, workout_exercise_id, position),
  foreign key (workspace_id, workout_instance_id, workout_exercise_id)
    references public.workout_exercises (workspace_id, workout_instance_id, id) on delete restrict,
  check (reps is null or seconds is null)
);

create index set_results_exercise_idx
  on public.set_results (workspace_id, workout_exercise_id, position);

create function public.validate_set_result_measure()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_measure text;
begin
  select we.measure_snapshot into v_measure
  from public.workout_exercises we
  where we.workspace_id = new.workspace_id
    and we.workout_instance_id = new.workout_instance_id
    and we.id = new.workout_exercise_id;
  if (v_measure = 'reps' and new.seconds is not null)
     or (v_measure = 'seconds' and new.reps is not null) then
    raise exception 'set result value does not match exercise measure' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger set_results_measure_check before insert or update on public.set_results
for each row execute function public.validate_set_result_measure();

create table public.session_notes (
  id uuid primary key,
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  workout_instance_id uuid not null,
  text text not null,
  author_user_id uuid not null references auth.users (id),
  device_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  foreign key (workspace_id, workout_instance_id)
    references public.workout_instances (workspace_id, id) on delete restrict
);

create index session_notes_instance_idx
  on public.session_notes (workspace_id, workout_instance_id, created_at);

create table public.private_notes (
  id uuid primary key,
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  workout_instance_id uuid,
  client_record_id uuid,
  text text not null,
  author_user_id uuid not null references auth.users (id),
  device_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id),
  foreign key (workspace_id, workout_instance_id)
    references public.workout_instances (workspace_id, id) on delete restrict,
  foreign key (workspace_id, client_record_id)
    references public.client_records (workspace_id, id) on delete restrict,
  check ((workout_instance_id is not null) <> (client_record_id is not null))
);

create index private_notes_client_idx
  on public.private_notes (workspace_id, client_record_id, created_at desc)
  where client_record_id is not null;
create index private_notes_instance_idx
  on public.private_notes (workspace_id, workout_instance_id, created_at desc)
  where workout_instance_id is not null;

create table public.sync_operations (
  operation_id uuid primary key,
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete restrict,
  device_id uuid not null,
  kind text not null check (length(btrim(kind)) > 0),
  entity_id uuid not null,
  base_revision integer not null check (base_revision >= 0),
  applied_at timestamptz not null default now(),
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id)
);

create index sync_operations_owner_idx
  on public.sync_operations (workspace_id, user_id, applied_at desc);

create trigger workout_instances_touch_updated_at before update on public.workout_instances
for each row execute function public.touch_updated_at();
create trigger workout_exercises_touch_updated_at before update on public.workout_exercises
for each row execute function public.touch_updated_at();
create trigger set_results_touch_updated_at before update on public.set_results
for each row execute function public.touch_updated_at();
create trigger session_notes_touch_updated_at before update on public.session_notes
for each row execute function public.touch_updated_at();
create trigger private_notes_touch_updated_at before update on public.private_notes
for each row execute function public.touch_updated_at();

alter table public.workout_instances enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.set_results enable row level security;
alter table public.session_notes enable row level security;
alter table public.private_notes enable row level security;
alter table public.sync_operations enable row level security;

create policy workout_instances_read_owner_or_finished_client on public.workout_instances
for select to authenticated using (
  public.is_workspace_owner(workspace_id)
  or (finished_at is not null and client_record_id in (select public.my_client_record_ids()))
);

create policy workout_exercises_read_owner_or_finished_client on public.workout_exercises
for select to authenticated using (
  public.is_workspace_owner(workspace_id)
  or exists (
    select 1 from public.workout_instances wi
    where wi.workspace_id = workout_exercises.workspace_id
      and wi.id = workout_exercises.workout_instance_id
      and wi.finished_at is not null
      and wi.client_record_id in (select public.my_client_record_ids())
  )
);

create policy set_results_read_owner_or_finished_client on public.set_results
for select to authenticated using (
  public.is_workspace_owner(workspace_id)
  or exists (
    select 1 from public.workout_instances wi
    where wi.workspace_id = set_results.workspace_id
      and wi.id = set_results.workout_instance_id
      and wi.finished_at is not null
      and wi.client_record_id in (select public.my_client_record_ids())
  )
);

create policy session_notes_read_owner_or_finished_client on public.session_notes
for select to authenticated using (
  public.is_workspace_owner(workspace_id)
  or exists (
    select 1 from public.workout_instances wi
    where wi.workspace_id = session_notes.workspace_id
      and wi.id = session_notes.workout_instance_id
      and wi.finished_at is not null
      and wi.client_record_id in (select public.my_client_record_ids())
  )
);

create policy private_notes_read_owner on public.private_notes
for select to authenticated using (public.is_workspace_owner(workspace_id));

create policy sync_operations_read_owner on public.sync_operations
for select to authenticated using (public.is_workspace_owner(workspace_id));

revoke all on public.workout_instances, public.workout_exercises, public.set_results,
  public.session_notes, public.private_notes, public.sync_operations
from public, anon, authenticated;
grant select on public.workout_instances, public.workout_exercises, public.set_results,
  public.session_notes, public.private_notes, public.sync_operations to authenticated;

revoke all on function public.validate_set_result_measure() from public, anon, authenticated;

commit;
