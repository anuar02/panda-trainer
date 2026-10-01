begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.exercise_catalog (
  source_key text primary key,
  name text not null,
  muscle_group text not null,
  equipment text not null,
  measure text not null check (measure in ('reps', 'seconds')),
  bodyweight boolean not null,
  aliases text[] not null default '{}',
  instructions text[] not null default '{}'
);
alter table private.exercise_catalog enable row level security;
revoke all on private.exercise_catalog from public, anon, authenticated;

create function public.normalize_library_name(input_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select lower(
    replace(
      replace(
        btrim(regexp_replace(input_name, '[[:space:]]+', ' ', 'g')),
        'Ё', 'Е'
      ),
      'ё', 'е'
    )
  );
$$;

create function public.canonicalize_library_name(input_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $$
  select btrim(regexp_replace(input_name, '[[:space:]]+', ' ', 'g'));
$$;

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  source_key text,
  name text not null check (length(btrim(name)) between 1 and 120),
  name_normalized text generated always as (public.normalize_library_name(name)) stored,
  muscle_group text not null,
  equipment text not null,
  measure text not null check (measure in ('reps', 'seconds')),
  bodyweight boolean not null default false,
  aliases text[] not null default '{}',
  instructions text[] not null default '{}',
  archived_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id)
);

create unique index exercises_active_name_unique
on public.exercises (workspace_id, name_normalized)
where archived_at is null;

create unique index exercises_source_key_unique
on public.exercises (workspace_id, source_key)
where source_key is not null;

create table public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  name text not null check (
    length(btrim(name)) between 1 and 80
    and name not in ('__proto__', 'prototype', 'constructor')
  ),
  name_normalized text generated always as (public.normalize_library_name(name)) stored,
  description text not null default '' check (length(description) <= 400),
  archived_at timestamptz,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id),
  unique (workspace_id, id)
);

create unique index workout_templates_active_name_unique
on public.workout_templates (workspace_id, name_normalized)
where archived_at is null;

create table public.template_exercises (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  template_id uuid not null,
  exercise_id uuid not null,
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
  unique (workspace_id, template_id, position) deferrable initially deferred,
  unique (workspace_id, template_id, exercise_id),
  foreign key (workspace_id, template_id)
    references public.workout_templates (workspace_id, id) on delete restrict,
  foreign key (workspace_id, exercise_id)
    references public.exercises (workspace_id, id) on delete restrict,
  check ((planned_reps is not null) <> (planned_seconds is not null)),
  check (planned_reps is null or planned_reps ~ '^[0-9]{1,3}([–-][0-9]{1,3})?$'),
  check (planned_seconds is null or planned_seconds ~ '^[0-9]{1,4}([–-][0-9]{1,4})?$')
);

create index template_exercises_template_idx
on public.template_exercises (workspace_id, template_id, position);

create function public.canonicalize_library_row_name()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.name := public.canonicalize_library_name(new.name);
  return new;
end;
$$;

create trigger exercises_canonicalize_name
before insert or update of name on public.exercises
for each row execute function public.canonicalize_library_row_name();

create trigger workout_templates_canonicalize_name
before insert or update of name on public.workout_templates
for each row execute function public.canonicalize_library_row_name();

create trigger exercises_touch_updated_at
before update on public.exercises
for each row execute function public.touch_updated_at();

create trigger workout_templates_touch_updated_at
before update on public.workout_templates
for each row execute function public.touch_updated_at();

create trigger template_exercises_touch_updated_at
before update on public.template_exercises
for each row execute function public.touch_updated_at();

create function public.enforce_template_limit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  active_count integer;
begin
  if new.archived_at is null then
    perform 1
    from public.trainer_workspaces w
    where w.id = new.workspace_id
    for update;
    select count(*)::integer into active_count
    from public.workout_templates t
    where t.workspace_id = new.workspace_id
      and t.archived_at is null
      and t.id <> new.id;
    if active_count >= 100 then
      raise exception 'A workspace can have at most 100 active workout templates'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger workout_templates_active_limit
before insert or update of archived_at on public.workout_templates
for each row execute function public.enforce_template_limit();

create function public.enforce_template_exercise_rules()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  exercise_measure text;
  item_count integer;
  value_range text[];
begin
  perform 1
  from public.workout_templates t
  where t.workspace_id = new.workspace_id
    and t.id = new.template_id
  for update;
  select e.measure into exercise_measure
  from public.exercises e
  where e.workspace_id = new.workspace_id
    and e.id = new.exercise_id;
  if not found then
    raise exception 'Exercise does not belong to the template workspace'
      using errcode = 'foreign_key_violation';
  end if;
  if exercise_measure = 'reps' and new.planned_reps is null then
    raise exception 'Repetition exercises require planned_reps'
      using errcode = 'check_violation';
  elsif exercise_measure = 'seconds' and new.planned_seconds is null then
    raise exception 'Timed exercises require planned_seconds'
      using errcode = 'check_violation';
  end if;
  if new.planned_reps is not null then
    value_range := regexp_split_to_array(new.planned_reps, '[–-]');
    if value_range[1]::integer < 1 or value_range[1]::integer > 999
      or (cardinality(value_range) = 2 and (value_range[2]::integer < value_range[1]::integer or value_range[2]::integer > 999)) then
      raise exception 'Planned repetitions must be in the range 1 to 999'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.planned_seconds is not null then
    value_range := regexp_split_to_array(new.planned_seconds, '[–-]');
    if value_range[1]::integer < 1 or value_range[1]::integer > 3600
      or (cardinality(value_range) = 2 and (value_range[2]::integer < value_range[1]::integer or value_range[2]::integer > 3600)) then
      raise exception 'Planned seconds must be in the range 1 to 3600'
        using errcode = 'check_violation';
    end if;
  end if;
  select count(*)::integer into item_count
  from public.template_exercises te
  where te.workspace_id = new.workspace_id
    and te.template_id = new.template_id
    and te.id <> new.id;
  if item_count >= 50 then
    raise exception 'A workout template can have at most 50 exercises'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger template_exercises_validate
before insert or update on public.template_exercises
for each row execute function public.enforce_template_exercise_rules();

create function public.bump_template_revision_from_exercise()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  changed_workspace_id uuid;
  changed_template_id uuid;
begin
  if tg_op = 'DELETE' then
    changed_workspace_id := old.workspace_id;
    changed_template_id := old.template_id;
  else
    changed_workspace_id := new.workspace_id;
    changed_template_id := new.template_id;
  end if;
  update public.workout_templates
  set updated_at = now()
  where workspace_id = changed_workspace_id and id = changed_template_id;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger template_exercises_bump_parent_revision
after insert or update or delete on public.template_exercises
for each row execute function public.bump_template_revision_from_exercise();

create function public.seed_workspace_exercises()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.exercises (workspace_id, source_key, name, muscle_group, equipment, measure, bodyweight, aliases, instructions, created_by)
  select new.id, source_key, name, muscle_group, equipment, measure, bodyweight, aliases, instructions, new.owner_user_id
  from private.exercise_catalog;
  return new;
end;
$$;

create trigger trainer_workspaces_seed_exercises
after insert on public.trainer_workspaces
for each row execute function public.seed_workspace_exercises();

create function public.search_exercises(search_query text)
returns setof public.exercises
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select e.*
  from public.exercises e
  join public.trainer_workspaces w on w.id = e.workspace_id
  where w.owner_user_id = (select auth.uid())
    and e.archived_at is null
    and (
      coalesce(public.normalize_library_name(search_query), '') = ''
      or position(public.normalize_library_name(search_query) in e.name_normalized) > 0
      or exists (
        select 1
        from unnest(e.aliases) as a(value)
        where position(public.normalize_library_name(search_query) in public.normalize_library_name(a.value)) > 0
      )
    )
  order by e.name_normalized, e.id;
$$;

revoke all on function public.normalize_library_name(text) from public, anon;
revoke all on function public.canonicalize_library_name(text) from public, anon;
revoke all on function public.canonicalize_library_row_name() from public, anon, authenticated;
revoke all on function public.enforce_template_limit() from public, anon, authenticated;
revoke all on function public.enforce_template_exercise_rules() from public, anon, authenticated;
revoke all on function public.seed_workspace_exercises() from public, anon, authenticated;
revoke all on function public.bump_template_revision_from_exercise() from public, anon, authenticated;
revoke all on function public.search_exercises(text) from public, anon;
grant execute on function public.normalize_library_name(text) to authenticated;
grant execute on function public.canonicalize_library_name(text) to authenticated;
grant execute on function public.search_exercises(text) to authenticated;

alter table public.exercises enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_exercises enable row level security;

create policy exercises_read_owner on public.exercises
for select to authenticated using (public.is_workspace_owner(workspace_id));
create policy exercises_insert_owner on public.exercises
for insert to authenticated with check (public.is_workspace_owner(workspace_id));
create policy exercises_update_owner on public.exercises
for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

create policy workout_templates_read_owner on public.workout_templates
for select to authenticated using (public.is_workspace_owner(workspace_id));
create policy workout_templates_insert_owner on public.workout_templates
for insert to authenticated with check (public.is_workspace_owner(workspace_id));
create policy workout_templates_update_owner on public.workout_templates
for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

create policy template_exercises_read_owner on public.template_exercises
for select to authenticated using (public.is_workspace_owner(workspace_id));
create policy template_exercises_insert_owner on public.template_exercises
for insert to authenticated with check (public.is_workspace_owner(workspace_id));
create policy template_exercises_update_owner on public.template_exercises
for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));
create policy template_exercises_delete_owner on public.template_exercises
for delete to authenticated using (public.is_workspace_owner(workspace_id));

revoke all on public.exercises, public.workout_templates, public.template_exercises
from public, anon, authenticated;

grant select on public.exercises, public.workout_templates, public.template_exercises to authenticated;
grant insert (workspace_id, name, muscle_group, equipment, measure, bodyweight, aliases, instructions)
on public.exercises to authenticated;
grant update (name, muscle_group, equipment, bodyweight, aliases, instructions, archived_at)
on public.exercises to authenticated;
grant insert (workspace_id, name, description)
on public.workout_templates to authenticated;
grant update (name, description, archived_at)
on public.workout_templates to authenticated;
grant insert (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps, planned_seconds, planned_weight_g, rest_seconds, note)
on public.template_exercises to authenticated;
grant update (exercise_id, position, planned_sets, planned_reps, planned_seconds, planned_weight_g, rest_seconds, note)
on public.template_exercises to authenticated;
grant delete on public.template_exercises to authenticated;

commit;
