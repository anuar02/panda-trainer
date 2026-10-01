begin;

create table private.client_creation_receipts (
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  request_id uuid not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_user_id, request_id)
);

alter table private.client_creation_receipts enable row level security;
revoke all on private.client_creation_receipts from public, anon, authenticated;

create function public.create_client_record(client_name text, client_phone text, request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_client_name text := nullif(btrim(client_name), '');
  v_client_phone text := nullif(btrim(client_phone), '');
  v_payload jsonb;
  v_existing private.client_creation_receipts%rowtype;
  v_client public.client_records%rowtype;
  v_result jsonb;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select w.id into v_workspace_id
  from public.trainer_workspaces w
  where w.owner_user_id = v_actor_user_id
  for update;

  if v_workspace_id is null then
    raise exception 'Workspace not found' using errcode = '42501';
  end if;

  if request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;

  if v_client_name is null or length(v_client_name) not between 1 and 120 then
    raise exception 'client_name must contain 1 to 120 characters' using errcode = '22023';
  end if;

  if v_client_phone is not null and length(v_client_phone) > 80 then
    raise exception 'client_phone must contain at most 80 characters' using errcode = '22023';
  end if;

  v_payload := jsonb_build_object('client_name', v_client_name, 'client_phone', v_client_phone);

  select * into v_existing
  from private.client_creation_receipts r
  where r.workspace_id = v_workspace_id
    and r.actor_user_id = v_actor_user_id
    and r.request_id = create_client_record.request_id;

  if found then
    if v_existing.payload <> v_payload then
      raise exception 'Request id was already used with a different payload' using errcode = '22023';
    end if;
    return v_existing.result || jsonb_build_object('replayed', true);
  end if;

  insert into public.client_records (workspace_id, display_name, phone, user_id, created_by)
  values (v_workspace_id, v_client_name, v_client_phone, null, v_actor_user_id)
  returning * into v_client;

  v_result := to_jsonb(v_client);
  insert into private.client_creation_receipts (workspace_id, actor_user_id, request_id, payload, result)
  values (v_workspace_id, v_actor_user_id, create_client_record.request_id, v_payload, v_result);

  return v_result || jsonb_build_object('replayed', false);
end;
$$;

revoke all on function public.create_client_record(text, text, uuid) from public, anon;
grant execute on function public.create_client_record(text, text, uuid) to authenticated;

comment on function public.create_client_record(text, text, uuid) is
  'Creates an unlinked client in the authenticated trainer’s workspace. Idempotent by workspace, actor and request id; retries return the original client snapshot.';

commit;
