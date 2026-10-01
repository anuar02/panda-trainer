begin;

alter table public.trainer_workspaces
  add column training_focus text[] not null default array['strength']::text[]
    check (cardinality(training_focus) <= 6 and array_position(training_focus, null) is null
      and training_focus <@ array['strength', 'functional', 'weight_loss', 'rehabilitation', 'boxing', 'yoga']::text[]),
  add column working_days integer[] not null default array[0,1,2,3,4,5]
    check (cardinality(working_days) between 1 and 7 and array_position(working_days, null) is null
      and working_days <@ array[0,1,2,3,4,5,6]),
  add column day_start time not null default '07:00',
  add column day_end time not null default '21:00',
  add column usual_session_minutes integer not null default 60
    check (usual_session_minutes in (45,60,90)),
  add constraint workspace_day_interval check (day_start < day_end);

grant insert (training_focus, working_days, day_start, day_end, usual_session_minutes),
  update (training_focus, working_days, day_start, day_end, usual_session_minutes)
on public.trainer_workspaces to authenticated;

create function public.complete_trainer_onboarding(
  display_name text,
  workspace_name text,
  selected_focus text[] default array['strength']::text[],
  selected_days integer[] default array[0,1,2,3,4,5],
  starts_at time default '07:00',
  ends_at time default '21:00',
  session_minutes integer default 60,
  first_client_name text default null,
  first_client_phone text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  result_workspace public.trainer_workspaces%rowtype;
  normalized_display_name text := btrim(display_name);
  normalized_workspace_name text := btrim(workspace_name);
  normalized_client_name text := nullif(btrim(first_client_name), '');
  normalized_client_phone text := nullif(btrim(first_client_phone), '');
  canonical_focus text[];
  canonical_days integer[];
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  if normalized_display_name is null or length(normalized_display_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'display_name must contain 1 to 120 characters';
  end if;

  if normalized_workspace_name is null or length(normalized_workspace_name) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'workspace_name must contain 1 to 120 characters';
  end if;

  if selected_focus is null or array_position(selected_focus, null) is not null
    or not selected_focus <@ array['strength', 'functional', 'weight_loss', 'rehabilitation', 'boxing', 'yoga']::text[]
    or selected_days is null or cardinality(selected_days) = 0 or array_position(selected_days, null) is not null
    or not selected_days <@ array[0,1,2,3,4,5,6]
    or starts_at is null or ends_at is null or starts_at >= ends_at
    or session_minutes is null or session_minutes not in (45,60,90) then
    raise exception using errcode = '22023', message = 'invalid trainer preferences';
  end if;

  if length(normalized_client_name) > 120 or length(normalized_client_phone) > 80
    or (normalized_client_name is null and normalized_client_phone is not null) then
    raise exception using errcode = '22023', message = 'invalid first client';
  end if;

  select coalesce(array_agg(value order by value), '{}'::text[]) into canonical_focus
  from (select distinct unnest(selected_focus) as value) values_to_keep;
  select array_agg(value order by value) into canonical_days
  from (select distinct unnest(selected_days) as value) values_to_keep;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  insert into public.profiles (user_id, display_name)
  values (current_user_id, normalized_display_name)
  on conflict (user_id) do nothing;

  insert into public.trainer_workspaces (
    owner_user_id, name, training_focus, working_days, day_start, day_end, usual_session_minutes
  )
  values (
    current_user_id, normalized_workspace_name, canonical_focus, canonical_days, starts_at, ends_at, session_minutes
  )
  on conflict (owner_user_id) do nothing
  returning * into result_workspace;

  if found and normalized_client_name is not null then
    insert into public.client_records (workspace_id, display_name, phone)
    values (result_workspace.id, normalized_client_name, normalized_client_phone);
  end if;

  select * into strict result_workspace
  from public.trainer_workspaces
  where owner_user_id = current_user_id;

  return to_jsonb(result_workspace);
end;
$$;

revoke all on function public.complete_trainer_onboarding(text, text, text[], integer[], time, time, integer, text, text) from public, anon;
grant execute on function public.complete_trainer_onboarding(text, text, text[], integer[], time, time, integer, text, text) to authenticated;

comment on function public.complete_trainer_onboarding(text, text, text[], integer[], time, time, integer, text, text) is
  'Atomically creates a trainer profile, workspace preferences, catalog and optional unregistered client for auth.uid(). Existing values are preserved on retry; no duplicate first client is created. The application uses the trainer display name as the workspace label.';

commit;
