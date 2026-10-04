begin;

create function public.get_my_client_overview(p_client_record_id uuid, p_starts_on date, p_ends_on date)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_context jsonb;
  v_workspace uuid;
  v_today date;
  v_result jsonb;
begin
  if p_starts_on is null or p_ends_on is null or p_ends_on <= p_starts_on
    or p_ends_on - p_starts_on > 366 then
    raise exception 'Invalid attendance period' using errcode = '22023';
  end if;
  v_context := public.get_my_client_schedule_context(p_client_record_id);
  v_workspace := (v_context->>'workspace_id')::uuid;
  v_today := (current_timestamp at time zone (v_context->>'timezone'))::date;
  with packages as (
    select p.units, p.expires_on, p.price_minor,
      coalesce((select sum(c.units) from public.credit_entries c
        where c.workspace_id = v_workspace and c.client_record_id = p_client_record_id and c.purchase_id = p.id), 0) as remaining,
      coalesce((select sum(e.amount_minor) from public.payment_entries e
        where e.workspace_id = v_workspace and e.client_record_id = p_client_record_id and e.purchase_id = p.id), 0) as paid
    from public.client_purchases p
    where p.workspace_id = v_workspace and p.client_record_id = p_client_record_id
  ), visits as (
    select a.service_date, count(*) as count
    from public.attendance_records a
    where a.workspace_id = v_workspace and a.client_record_id = p_client_record_id
      and a.status = 'present' and a.service_date >= p_starts_on and a.service_date < p_ends_on
    group by a.service_date
  )
  select jsonb_build_object(
    'context', v_context, 'today', v_today, 'starts_on', p_starts_on, 'ends_on', p_ends_on,
    'remaining_units', coalesce(sum(remaining) filter (where expires_on is null or expires_on >= v_today), 0)::text,
    'active_units', coalesce(sum(units) filter (where expires_on is null or expires_on >= v_today), 0)::text,
    'due_minor', coalesce(sum(price_minor - paid), 0)::text,
    'visits', (select coalesce(jsonb_agg(jsonb_build_object('date', service_date, 'count', count::text) order by service_date), '[]'::jsonb) from visits)
  ) into v_result from packages;
  return v_result;
end;
$$;

revoke all on function public.get_my_client_overview(uuid,date,date) from public, anon;
grant execute on function public.get_my_client_overview(uuid,date,date) to authenticated;

commit;
