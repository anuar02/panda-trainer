begin;

create function public.export_trainer_workspace(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
set timezone = 'UTC'
set datestyle = 'ISO, YMD'
as $$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or not exists (
    select 1 from public.trainer_workspaces w
    where w.id = p_workspace_id and w.owner_user_id = v_owner
  ) then
    raise exception 'account_export_forbidden' using errcode = '42501';
  end if;

  -- STABLE reads use the calling statement's MVCC snapshot, including the owner check.
  -- Explicit projections keep future columns and invitation hashes out of this contract.
  return jsonb_build_object(
    'format', 'panda-trainer-workspace',
    'version', 1,
    'workspace_id', p_workspace_id,
    'owner_user_id', v_owner,
    'exported_at', statement_timestamp(),
    'limitations', '["server_only_no_local_pending", "operational_receipts_excluded", "no_unstored_revision_history", "auth_credentials_excluded"]'::jsonb,
    'collections', jsonb_build_object(
      'profiles', (select coalesce(jsonb_agg(to_jsonb(x) order by x.user_id), '[]'::jsonb)
        from (select r.user_id, r.display_name, r.locale, r.revision, r.created_at, r.updated_at, r.created_by
          from public.profiles r where r.user_id = v_owner) x),
      'trainer_workspaces', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.owner_user_id, r.name, r.timezone, r.revision, r.created_at, r.updated_at, r.created_by, r.training_focus, r.working_days, r.day_start, r.day_end, r.usual_session_minutes
          from public.trainer_workspaces r where r.id = p_workspace_id) x),
      'client_records', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.user_id, r.display_name, r.phone, r.archived_at, r.revision, r.created_at, r.updated_at, r.created_by
          from public.client_records r where r.workspace_id = p_workspace_id) x),
      'invitations', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.client_record_id, r.expires_at, r.accepted_by, r.accepted_at, r.revision, r.created_at, r.updated_at, r.created_by, r.revoked_at
          from public.invitations r where exists (select 1 from public.client_records c where c.id = r.client_record_id and c.workspace_id = p_workspace_id)) x),
      'exercises', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.source_key, r.name, r.name_normalized, r.muscle_group, r.equipment, r.measure, r.bodyweight, r.aliases, r.instructions, r.archived_at, r.revision, r.created_at, r.updated_at, r.created_by
          from public.exercises r where r.workspace_id = p_workspace_id) x),
      'workout_templates', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.name, r.name_normalized, r.description, r.archived_at, r.revision, r.created_at, r.updated_at, r.created_by
          from public.workout_templates r where r.workspace_id = p_workspace_id) x),
      'template_exercises', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.template_id, r.exercise_id, r.position, r.planned_sets, r.planned_reps, r.planned_seconds, r.planned_weight_g, r.rest_seconds, r.note, r.revision, r.created_at, r.updated_at, r.created_by
          from public.template_exercises r where r.workspace_id = p_workspace_id) x),
      'group_sessions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.starts_at, r.ends_at, r.revision, r.created_at, r.updated_at, r.created_by
          from public.group_sessions r where r.workspace_id = p_workspace_id) x),
      'bookings', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.group_session_id, r.starts_at, r.ends_at, r.status, r.revision, r.created_at, r.updated_at, r.created_by
          from public.bookings r where r.workspace_id = p_workspace_id) x),
      'schedule_proposals', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.booking_id, r.author_user_id, r.proposed_starts_at, r.proposed_ends_at, r.base_revision, r.status, r.revision, r.created_at, r.updated_at, r.created_by
          from public.schedule_proposals r where r.workspace_id = p_workspace_id) x),
      'client_programs', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.base_template_id, r.base_template_revision, r.name, r.description, r.revision, r.created_at, r.updated_at, r.created_by
          from public.client_programs r where r.workspace_id = p_workspace_id) x),
      'client_program_exercises', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_program_id, r.exercise_id, r.exercise_name_snapshot, r.measure_snapshot, r.bodyweight_snapshot, r.muscle_group_snapshot, r.equipment_snapshot, r.instructions_snapshot, r.source_key_snapshot, r.position, r.planned_sets, r.planned_reps, r.planned_seconds, r.planned_weight_g, r.rest_seconds, r.note, r.revision, r.created_at, r.updated_at, r.created_by
          from public.client_program_exercises r where r.workspace_id = p_workspace_id) x),
      'workout_instances', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.booking_id, r.client_record_id, r.source_program_id, r.source_program_revision, r.started_at, r.finished_at, r.revision, r.created_at, r.updated_at, r.created_by
          from public.workout_instances r where r.workspace_id = p_workspace_id) x),
      'workout_exercises', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.workout_instance_id, r.exercise_id, r.exercise_name_snapshot, r.measure_snapshot, r.bodyweight_snapshot, r.muscle_group_snapshot, r.equipment_snapshot, r.instructions_snapshot, r.source_key_snapshot, r.position, r.planned_sets, r.planned_reps, r.planned_seconds, r.planned_weight_g, r.rest_seconds, r.note, r.replaced_from_id, r.skipped, r.revision, r.created_at, r.updated_at, r.created_by, r.source_device_id
          from public.workout_exercises r where r.workspace_id = p_workspace_id) x),
      'set_results', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.workout_instance_id, r.workout_exercise_id, r.position, r.reps, r.seconds, r.weight_g, r.author_user_id, r.device_id, r.revision, r.deleted_at, r.created_at, r.updated_at, r.created_by, r.requested_position
          from public.set_results r where r.workspace_id = p_workspace_id) x),
      'session_notes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.workout_instance_id, r.text, r.author_user_id, r.device_id, r.revision, r.created_at, r.updated_at, r.created_by
          from public.session_notes r where r.workspace_id = p_workspace_id) x),
      'private_notes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.workout_instance_id, r.client_record_id, r.text, r.author_user_id, r.device_id, r.revision, r.created_at, r.updated_at, r.created_by
          from public.private_notes r where r.workspace_id = p_workspace_id) x),
      'booking_programs', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.booking_id, r.base_template_id, r.base_template_revision, r.name, r.description, r.created_at, r.created_by
          from public.booking_programs r where r.workspace_id = p_workspace_id) x),
      'booking_program_exercises', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.booking_program_id, r.exercise_id, r.exercise_name_snapshot, r.measure_snapshot, r.bodyweight_snapshot, r.muscle_group_snapshot, r.equipment_snapshot, r.instructions_snapshot, r.source_key_snapshot, r.position, r.planned_sets, r.planned_reps, r.planned_seconds, r.planned_weight_g, r.rest_seconds, r.note, r.created_at, r.created_by
          from public.booking_program_exercises r where r.workspace_id = p_workspace_id) x),
      'client_purchases', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.title, r.units, r.price_minor::text as price_minor, r.currency, r.expires_on, r.created_at, r.created_by
          from public.client_purchases r where r.workspace_id = p_workspace_id) x),
      'attendance_records', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.booking_id, r.service_date, r.status, r.revision, r.cycle, r.created_at, r.updated_at
          from public.attendance_records r where r.workspace_id = p_workspace_id) x),
      'attendance_revisions', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.attendance_id, r.revision, r.cycle, r.status, r.service_date, r.reason, r.created_at, r.created_by
          from public.attendance_revisions r where r.workspace_id = p_workspace_id) x),
      'credit_entries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.purchase_id, r.attendance_id, r.booking_id, r.cycle, r.kind, r.units, r.reason, r.reverses_entry_id, r.created_at, r.created_by
          from public.credit_entries r where r.workspace_id = p_workspace_id) x),
      'payment_entries', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.client_record_id, r.purchase_id, r.kind, r.amount_minor::text as amount_minor, r.currency, r.paid_on, r.method, r.source, r.reason, r.reverses_entry_id, r.created_at, r.created_by
          from public.payment_entries r where r.workspace_id = p_workspace_id) x),
      'workout_sync_conflicts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.workout_instance_id, r.entity_id, r.kind, r.current_version, r.incoming_operation, r.expected_revision, r.resolved_at, r.selected_version
          from public.workout_sync_conflicts r where r.workspace_id = p_workspace_id) x),
      'workout_correction_drafts', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb)
        from (select r.id, r.workspace_id, r.workout_instance_id, r.operation, r.created_at
          from public.workout_correction_drafts r where r.workspace_id = p_workspace_id) x)
    )
  );
end;
$$;

revoke all on function public.export_trainer_workspace(uuid) from public, anon, authenticated, service_role;
grant execute on function public.export_trainer_workspace(uuid) to authenticated;

commit;
