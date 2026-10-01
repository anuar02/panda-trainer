begin;

create table private.template_command_receipts (
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  request_id uuid not null,
  command text not null check (command in ('save', 'archive')),
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, request_id)
);
alter table private.template_command_receipts enable row level security;
revoke all on private.template_command_receipts from public, anon, authenticated;

create function public.save_workout_template(
  p_template_id uuid,
  p_expected_revision integer,
  p_name text,
  p_description text,
  p_exercises jsonb,
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
  v_existing private.template_command_receipts%rowtype;
  v_payload jsonb;
  v_template public.workout_templates%rowtype;
  v_id uuid;
  v_revision integer;
  v_name text;
  v_count integer;
  v_position integer;
  v_item jsonb;
  v_exercise_id uuid;
  v_reps text;
  v_seconds text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select w.id into v_workspace_id from public.trainer_workspaces w where w.owner_user_id = v_user_id;
  if v_workspace_id is null then raise exception 'Workspace not found' using errcode = '42501'; end if;
  perform 1 from public.trainer_workspaces w where w.id = v_workspace_id for update;
  if p_request_id is null then raise exception 'request_id is required' using errcode = '22023'; end if;
  v_name := public.canonicalize_library_name(coalesce(p_name, ''));
  v_payload := jsonb_build_object('template_id', p_template_id, 'expected_revision', p_expected_revision,
    'name', p_name, 'description', p_description, 'exercises', p_exercises);
  select * into v_existing from private.template_command_receipts r
    where r.workspace_id = v_workspace_id and r.request_id = p_request_id;
  if found then
    if v_existing.command <> 'save' or v_existing.payload <> v_payload then
      raise exception 'Request id was already used with a different command or payload' using errcode = '22023';
    end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'Exercises must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_exercises);
  if v_count < 1 or v_count > 50 then raise exception 'Template must contain 1 to 50 exercises' using errcode = '23514'; end if;
  if p_template_id is null then
    if p_expected_revision is not null then raise exception 'New template revision must be null' using errcode = '22023'; end if;
    if length(v_name) not between 1 and 80
      or v_name in ('__proto__', 'prototype', 'constructor') then
      raise exception 'Invalid template name' using errcode = '23514';
    end if;
    if exists (select 1 from public.workout_templates t where t.workspace_id = v_workspace_id
      and t.archived_at is null and t.name_normalized = public.normalize_library_name(p_name)) then
      raise exception 'Template name already exists' using errcode = '23505';
    end if;
    if (select count(*) from public.workout_templates t where t.workspace_id = v_workspace_id and t.archived_at is null) >= 100 then
      raise exception 'Workspace template limit reached' using errcode = '23514';
    end if;
    insert into public.workout_templates (workspace_id, name, description, created_by)
      values (v_workspace_id, v_name, left(btrim(coalesce(p_description, '')), 400), v_user_id)
      returning id, revision into v_id, v_revision;
  else
    if p_expected_revision is null then raise exception 'expected_revision is required' using errcode = '22023'; end if;
    select * into v_template from public.workout_templates t
      where t.workspace_id = v_workspace_id and t.id = p_template_id for update;
    if not found or v_template.archived_at is not null then raise exception 'Template unavailable' using errcode = 'P0002'; end if;
    if v_template.revision <> p_expected_revision then raise exception 'Template revision is stale' using errcode = '40001'; end if;
    if length(v_name) not between 1 and 80
      or v_name in ('__proto__', 'prototype', 'constructor') then
      raise exception 'Invalid template name' using errcode = '23514';
    end if;
    if exists (select 1 from public.workout_templates t where t.workspace_id = v_workspace_id and t.id <> p_template_id
      and t.archived_at is null and t.name_normalized = public.normalize_library_name(p_name)) then
      raise exception 'Template name already exists' using errcode = '23505';
    end if;
    update public.workout_templates set name = v_name, description = left(btrim(coalesce(p_description, '')), 400),
      revision = revision + 1 where workspace_id = v_workspace_id and id = p_template_id
      returning id, revision into v_id, v_revision;
  end if;

  delete from public.template_exercises te where te.workspace_id = v_workspace_id and te.template_id = v_id;
  for v_item, v_position in select value, ordinality::integer - 1 from jsonb_array_elements(p_exercises) with ordinality loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(v_item->>'exercise_id', '') = '' then
      raise exception 'Invalid exercise entry' using errcode = '22023';
    end if;
    v_exercise_id := (v_item->>'exercise_id')::uuid;
    if (select count(*) from jsonb_array_elements(p_exercises) x where x->>'exercise_id' = v_item->>'exercise_id') > 1 then
      raise exception 'Duplicate exercise in template' using errcode = '23505';
    end if;
    v_reps := v_item->>'planned_reps';
    v_seconds := v_item->>'planned_seconds';
    insert into public.template_exercises (workspace_id, template_id, exercise_id, position, planned_sets,
      planned_reps, planned_seconds, planned_weight_g, rest_seconds, note, created_by)
    values (v_workspace_id, v_id, v_exercise_id, v_position,
      (v_item->>'planned_sets')::integer, v_reps, v_seconds,
      nullif(v_item->>'planned_weight_g', '')::integer, coalesce(nullif(v_item->>'rest_seconds', '')::integer, 0),
      nullif(v_item->>'note', ''), v_user_id);
  end loop;
  select revision into v_revision from public.workout_templates where workspace_id = v_workspace_id and id = v_id;
  v_payload := jsonb_build_object('template_id', p_template_id, 'expected_revision', p_expected_revision,
    'name', p_name, 'description', p_description, 'exercises', p_exercises);
  insert into private.template_command_receipts (workspace_id, request_id, command, payload, result)
    values (v_workspace_id, p_request_id, 'save', v_payload, jsonb_build_object('id', v_id, 'revision', v_revision));
  return jsonb_build_object('id', v_id, 'revision', v_revision, 'replayed', false);
end;
$$;

create function public.archive_workout_template(p_template_id uuid, p_expected_revision integer, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_receipt private.template_command_receipts%rowtype;
  v_payload jsonb;
  v_template public.workout_templates%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select w.id into v_workspace_id from public.trainer_workspaces w where w.owner_user_id = v_user_id;
  if v_workspace_id is null then raise exception 'Workspace not found' using errcode = '42501'; end if;
  perform 1 from public.trainer_workspaces w where w.id = v_workspace_id for update;
  if p_request_id is null then raise exception 'request_id is required' using errcode = '22023'; end if;
  v_payload := jsonb_build_object('template_id', p_template_id, 'expected_revision', p_expected_revision);
  select * into v_receipt from private.template_command_receipts r where r.workspace_id = v_workspace_id and r.request_id = p_request_id;
  if found then
    if v_receipt.command <> 'archive' or v_receipt.payload <> v_payload then raise exception 'Request id was already used with a different command or payload' using errcode = '22023'; end if;
    return v_receipt.result || jsonb_build_object('replayed', true);
  end if;
  select * into v_template from public.workout_templates t where t.workspace_id = v_workspace_id and t.id = p_template_id for update;
  if not found or v_template.archived_at is not null then raise exception 'Template unavailable' using errcode = 'P0002'; end if;
  if p_expected_revision is null or v_template.revision <> p_expected_revision then raise exception 'Template revision is stale' using errcode = '40001'; end if;
  update public.workout_templates set archived_at = now(), revision = revision + 1
    where workspace_id = v_workspace_id and id = p_template_id returning revision into v_template.revision;
  v_result := jsonb_build_object('id', p_template_id, 'revision', v_template.revision);
  insert into private.template_command_receipts (workspace_id, request_id, command, payload, result)
    values (v_workspace_id, p_request_id, 'archive', v_payload, v_result);
  return v_result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.save_workout_template(uuid, integer, text, text, jsonb, uuid) from public, anon;
revoke all on function public.archive_workout_template(uuid, integer, uuid) from public, anon;
grant execute on function public.save_workout_template(uuid, integer, text, text, jsonb, uuid) to authenticated;
grant execute on function public.archive_workout_template(uuid, integer, uuid) to authenticated;
revoke insert, update, delete on public.workout_templates, public.template_exercises from authenticated;
revoke insert (workspace_id, name, description), update (name, description, archived_at)
  on public.workout_templates from authenticated;
revoke insert (workspace_id, template_id, exercise_id, position, planned_sets, planned_reps, planned_seconds, planned_weight_g, rest_seconds, note),
  update (exercise_id, position, planned_sets, planned_reps, planned_seconds, planned_weight_g, rest_seconds, note)
  on public.template_exercises from authenticated;
revoke all on public.workout_templates, public.template_exercises from public, anon;
grant select on public.workout_templates, public.template_exercises to authenticated;

commit;
