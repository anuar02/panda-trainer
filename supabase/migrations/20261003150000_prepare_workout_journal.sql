begin;

create table private.workout_preparation_receipts (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id),
  workspace_id uuid not null references public.trainer_workspaces(id),
  booking_id uuid not null,
  requested_workout_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.workout_preparation_receipts enable row level security;
revoke all on private.workout_preparation_receipts from public, anon, authenticated;

create function public.prepare_workout_journal(
  p_booking_id uuid,
  p_workout_id uuid,
  p_request_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog
as $$
declare
  v_booking public.bookings%rowtype;
  v_program public.booking_programs%rowtype;
  v_workout public.workout_instances%rowtype;
  v_receipt private.workout_preparation_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_booking_id is null or p_workout_id is null or p_request_id is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;
  select b.* into v_booking from public.bookings b
  join public.trainer_workspaces w on w.id = b.workspace_id
  where b.id = p_booking_id and w.owner_user_id = auth.uid();
  if not found then
    raise exception 'entity_unavailable' using errcode = 'P0002';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_booking.workspace_id::text, 29));
  perform pg_advisory_xact_lock(hashtextextended('workout-preparation:' || p_request_id::text, 29));
  select * into v_receipt from private.workout_preparation_receipts where request_id = p_request_id;
  if found then
    if v_receipt.user_id <> auth.uid() or v_receipt.booking_id <> p_booking_id
       or v_receipt.requested_workout_id <> p_workout_id then
      raise exception 'request_id_reused' using errcode = '22023';
    end if;
    return v_receipt.result;
  end if;
  select b.* into v_booking from public.bookings b
  join public.client_records c on c.workspace_id = b.workspace_id and c.id = b.client_record_id
  where b.id = p_booking_id and b.workspace_id = v_booking.workspace_id
    and b.status in ('proposed', 'confirmed') and c.archived_at is null for update of b;
  if not found then
    raise exception 'entity_unavailable' using errcode = 'P0002';
  end if;
  select * into v_workout from public.workout_instances
  where workspace_id = v_booking.workspace_id and booking_id = p_booking_id for update;
  if not found then
    select * into v_program from public.booking_programs
    where workspace_id = v_booking.workspace_id and booking_id = p_booking_id;
    if not found then
      raise exception 'assignment_unavailable' using errcode = 'P0002';
    end if;
    insert into public.workout_instances(id, workspace_id, booking_id, client_record_id)
    values(p_workout_id, v_booking.workspace_id, p_booking_id, v_booking.client_record_id)
    returning * into v_workout;
    insert into public.workout_exercises(
      id, workspace_id, workout_instance_id, exercise_id, exercise_name_snapshot,
      measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot,
      instructions_snapshot, source_key_snapshot, position, planned_sets, planned_reps,
      planned_seconds, planned_weight_g, rest_seconds, note
    ) select id, workspace_id, v_workout.id, exercise_id, exercise_name_snapshot,
      measure_snapshot, bodyweight_snapshot, muscle_group_snapshot, equipment_snapshot,
      instructions_snapshot, source_key_snapshot, position, planned_sets, planned_reps,
      planned_seconds, planned_weight_g, rest_seconds, note
    from public.booking_program_exercises
    where workspace_id = v_booking.workspace_id and booking_program_id = v_program.id
    order by position;
  end if;
  v_result := jsonb_build_object('workout_id', v_workout.id, 'revision', v_workout.revision,
    'exercises', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id,
      'position', e.position, 'revision', e.revision) order by e.position), '[]'::jsonb)
      from public.workout_exercises e where e.workspace_id = v_booking.workspace_id
        and e.workout_instance_id = v_workout.id));
  insert into private.workout_preparation_receipts(request_id, user_id, workspace_id,
    booking_id, requested_workout_id, result)
  values(p_request_id, auth.uid(), v_booking.workspace_id, p_booking_id, p_workout_id, v_result);
  return v_result;
end;
$$;
revoke all on function public.prepare_workout_journal(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.prepare_workout_journal(uuid, uuid, uuid) to authenticated;

commit;
