begin;

create function public.get_my_client_schedule_context(p_client_record_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_client_record_id is null then raise exception 'Client record required' using errcode='22023'; end if;
  select jsonb_build_object('client_record_id',c.id,'workspace_id',c.workspace_id,
    'client_name',c.display_name,'trainer_name',w.name,'timezone',w.timezone)
    into v_result from public.client_records c
    join public.trainer_workspaces w on w.id=c.workspace_id
    where c.id=p_client_record_id and c.user_id=auth.uid() and c.archived_at is null;
  if not found then raise exception 'Client connection unavailable' using errcode='P0002'; end if;
  return v_result;
end;
$$;

create function public.get_my_client_schedule_proposals(
  p_client_record_id uuid,p_offset integer default 0,p_limit integer default 500
)
returns table (
  id uuid,workspace_id uuid,booking_id uuid,proposed_starts_at timestamptz,
  proposed_ends_at timestamptz,base_revision integer,status text,revision integer,
  created_at timestamptz,updated_at timestamptz,author_role text
)
language plpgsql stable security definer set search_path=pg_catalog
as $$
declare
  v_workspace uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_client_record_id is null or p_offset is null or p_offset<0
    or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'Invalid proposal page' using errcode='22023';
  end if;
  select c.workspace_id into v_workspace from public.client_records c
    where c.id=p_client_record_id and c.user_id=auth.uid() and c.archived_at is null;
  if not found then raise exception 'Client connection unavailable' using errcode='P0002'; end if;
  return query select p.id,p.workspace_id,p.booking_id,p.proposed_starts_at,p.proposed_ends_at,
    p.base_revision,p.status,p.revision,p.created_at,p.updated_at,
    case when p.author_user_id=w.owner_user_id then 'trainer'::text else 'client'::text end
    from public.schedule_proposals p
    join public.bookings b on b.workspace_id=p.workspace_id and b.id=p.booking_id
    join public.trainer_workspaces w on w.id=p.workspace_id
    where p.workspace_id=v_workspace and b.client_record_id=p_client_record_id and p.status='pending'
    order by p.id limit p_limit offset p_offset;
end;
$$;

revoke all on function public.get_my_client_schedule_context(uuid) from public,anon;
revoke all on function public.get_my_client_schedule_proposals(uuid,integer,integer) from public,anon;
grant execute on function public.get_my_client_schedule_context(uuid) to authenticated;
grant execute on function public.get_my_client_schedule_proposals(uuid,integer,integer) to authenticated;

commit;
