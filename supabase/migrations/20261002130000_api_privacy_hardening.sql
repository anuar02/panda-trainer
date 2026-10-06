begin;

revoke select on public.client_programs, public.client_program_exercises,
  public.workout_instances, public.workout_exercises, public.set_results,
  public.session_notes from public, anon, authenticated;
revoke select (created_by) on public.client_programs, public.client_program_exercises,
  public.workout_instances, public.workout_exercises from public, anon, authenticated;
revoke select (created_by, author_user_id, device_id) on public.set_results,
  public.session_notes from public, anon, authenticated;

grant select (id, workspace_id, client_record_id, base_template_id,
  base_template_revision, name, description, revision, created_at, updated_at)
  on public.client_programs to authenticated;
grant select (id, workspace_id, client_program_id, exercise_id,
  exercise_name_snapshot, measure_snapshot, bodyweight_snapshot,
  muscle_group_snapshot, equipment_snapshot, instructions_snapshot,
  source_key_snapshot, position, planned_sets, planned_reps, planned_seconds,
  planned_weight_g, rest_seconds, note, revision, created_at, updated_at)
  on public.client_program_exercises to authenticated;
grant select (id, workspace_id, booking_id, client_record_id, source_program_id,
  source_program_revision, started_at, finished_at, revision, created_at, updated_at)
  on public.workout_instances to authenticated;
grant select (id, workspace_id, workout_instance_id, exercise_id,
  exercise_name_snapshot, measure_snapshot, bodyweight_snapshot,
  muscle_group_snapshot, equipment_snapshot, instructions_snapshot,
  source_key_snapshot, position, planned_sets, planned_reps, planned_seconds,
  planned_weight_g, rest_seconds, note, replaced_from_id, skipped, revision,
  created_at, updated_at) on public.workout_exercises to authenticated;
grant select (id, workspace_id, workout_instance_id, workout_exercise_id,
  position, reps, seconds, weight_g, revision, deleted_at, created_at, updated_at)
  on public.set_results to authenticated;
grant select (id, workspace_id, workout_instance_id, text, revision,
  created_at, updated_at) on public.session_notes to authenticated;

create function public.get_my_workspace_schedule_proposals(
  p_workspace_id uuid, p_offset integer default 0, p_limit integer default 500
)
returns table (
  id uuid, workspace_id uuid, booking_id uuid, proposed_starts_at timestamptz,
  proposed_ends_at timestamptz, base_revision integer, status text, revision integer,
  created_at timestamptz, updated_at timestamptz, author_role text
)
language plpgsql stable security definer set search_path = pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_workspace_id is null or p_offset is null or p_offset < 0
    or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid proposal page' using errcode = '22023';
  end if;
  if not exists (select 1 from public.trainer_workspaces w
    where w.id = p_workspace_id and w.owner_user_id = auth.uid()) then
    raise exception 'Workspace unavailable' using errcode = 'P0002';
  end if;
  return query
    select p.id, p.workspace_id, p.booking_id, p.proposed_starts_at,
      p.proposed_ends_at, p.base_revision, p.status, p.revision,
      p.created_at, p.updated_at,
      case when p.author_user_id = w.owner_user_id then 'trainer'::text
        else 'client'::text end
    from public.schedule_proposals p
    join public.trainer_workspaces w on w.id = p.workspace_id
    where p.workspace_id = p_workspace_id and p.status = 'pending'
    order by p.proposed_starts_at, p.id limit p_limit offset p_offset;
end;
$$;
revoke all on function public.get_my_workspace_schedule_proposals(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_my_workspace_schedule_proposals(uuid, integer, integer)
  to authenticated;
revoke select (author_user_id) on public.schedule_proposals from public, anon, authenticated;

commit;
