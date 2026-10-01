begin;

create function public.list_my_client_connections()
returns table (
  client_record_id uuid,
  workspace_id uuid,
  trainer_name text,
  client_name text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  return query
  select c.id, c.workspace_id, w.name, c.display_name
  from public.client_records c
  join public.trainer_workspaces w on w.id = c.workspace_id
  where c.user_id = v_user_id
    and c.archived_at is null
  order by w.name, c.display_name, c.id;
end;
$$;

revoke all on function public.list_my_client_connections() from public, anon;
grant execute on function public.list_my_client_connections() to authenticated;

comment on function public.list_my_client_connections() is
  'Lists active client cards linked to auth.uid() across trainer workspaces, exposing only card/workspace IDs and trainer/client display names.';

commit;
