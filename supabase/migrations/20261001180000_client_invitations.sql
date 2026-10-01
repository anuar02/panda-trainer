begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.invitations
  add column revoked_at timestamptz,
  add constraint invitations_accepted_not_revoked
    check (accepted_at is null or revoked_at is null);

revoke select (accepted_by) on public.invitations from authenticated;
grant select (revoked_at) on public.invitations to authenticated;

create table private.client_invitation_receipts (
  workspace_id uuid not null references public.trainer_workspaces (id) on delete restrict,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  request_id uuid not null,
  command text not null check (command in ('issue', 'revoke')),
  payload jsonb not null,
  token_hash text,
  invitation_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, actor_user_id, request_id),
  check ((command = 'issue') = (token_hash is not null))
);

alter table private.client_invitation_receipts enable row level security;
revoke all on private.client_invitation_receipts from public, anon, authenticated;

create function public.issue_client_invitation(
  p_client_record_id uuid,
  p_token text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_client public.client_records%rowtype;
  v_invitation public.invitations%rowtype;
  v_receipt private.client_invitation_receipts%rowtype;
  v_token_hash text;
  v_payload jsonb;
  v_now timestamptz;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'request_id is required' using errcode = '22023';
  end if;
  if p_client_record_id is null then
    raise exception 'client_record_id is required' using errcode = '22023';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then
    raise exception 'token must be 32 random bytes encoded as unpadded base64url' using errcode = '22023';
  end if;

  v_token_hash := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');

  select w.id into v_workspace_id
  from public.trainer_workspaces w
  where w.owner_user_id = v_actor_user_id
  for update;

  if v_workspace_id is null then
    raise exception 'Workspace not found' using errcode = '42501';
  end if;

  select * into v_client
  from public.client_records c
  where c.id = p_client_record_id
    and c.workspace_id = v_workspace_id
  for update;

  if not found then
    raise exception 'Client record is unavailable' using errcode = 'P0002';
  end if;

  v_payload := jsonb_build_object(
    'client_record_id', p_client_record_id,
    'token_hash', v_token_hash
  );

  select * into v_receipt
  from private.client_invitation_receipts r
  where r.workspace_id = v_workspace_id
    and r.actor_user_id = v_actor_user_id
    and r.request_id = p_request_id;

  if found then
    if v_receipt.command <> 'issue' or v_receipt.payload <> v_payload then
      raise exception 'Request id was already used with a different payload' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'invitation_id', v_receipt.invitation_id,
      'expires_at', v_receipt.expires_at,
      'active', exists (
        select 1 from public.invitations i
        where i.id = v_receipt.invitation_id
          and i.accepted_at is null
          and i.revoked_at is null
          and i.expires_at > clock_timestamp()
      ),
      'replayed', true
    );
  end if;

  if v_client.user_id is not null or v_client.archived_at is not null then
    raise exception 'Client record is unavailable' using errcode = 'P0002';
  end if;

  update public.invitations i
  set revoked_at = clock_timestamp()
  where i.client_record_id = p_client_record_id
    and i.accepted_at is null
    and i.revoked_at is null;

  v_now := clock_timestamp();
  insert into public.invitations (
    client_record_id, token_hash, expires_at, created_by
  ) values (
    p_client_record_id, v_token_hash, v_now + interval '7 days', v_actor_user_id
  ) returning * into v_invitation;

  insert into private.client_invitation_receipts (
    workspace_id, actor_user_id, request_id, command, payload,
    token_hash, invitation_id, expires_at
  ) values (
    v_workspace_id, v_actor_user_id, p_request_id, 'issue', v_payload,
    v_token_hash, v_invitation.id, v_invitation.expires_at
  );

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'expires_at', v_invitation.expires_at,
    'active', true,
    'replayed', false
  );
exception
  when unique_violation then
    raise exception 'Token or request has already been used' using errcode = '22023';
end;
$$;

create function public.revoke_client_invitation(
  p_invitation_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_client public.client_records%rowtype;
  v_invitation public.invitations%rowtype;
  v_receipt private.client_invitation_receipts%rowtype;
  v_payload jsonb;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_request_id is null or p_invitation_id is null then
    raise exception 'invitation_id and request_id are required' using errcode = '22023';
  end if;

  select w.id into v_workspace_id
  from public.trainer_workspaces w
  where w.owner_user_id = v_actor_user_id
  for update;

  if v_workspace_id is null then
    raise exception 'Workspace not found' using errcode = '42501';
  end if;

  select c.* into v_client
  from public.client_records c
  join public.invitations i on i.client_record_id = c.id
  where i.id = p_invitation_id
    and c.workspace_id = v_workspace_id
  for update of c;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = 'P0002';
  end if;

  v_payload := jsonb_build_object('invitation_id', p_invitation_id);
  select * into v_receipt
  from private.client_invitation_receipts r
  where r.workspace_id = v_workspace_id
    and r.actor_user_id = v_actor_user_id
    and r.request_id = p_request_id;

  if found then
    if v_receipt.command <> 'revoke' or v_receipt.payload <> v_payload then
      raise exception 'Request id was already used with a different payload' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'invitation_id', v_receipt.invitation_id,
      'revoked', true,
      'replayed', true
    );
  end if;

  select * into v_invitation
  from public.invitations i
  where i.id = p_invitation_id
    and i.client_record_id = v_client.id
  for update;

  if not found or v_invitation.accepted_at is not null then
    raise exception 'Invitation is unavailable' using errcode = 'P0002';
  end if;

  if v_invitation.revoked_at is null then
    update public.invitations i
    set revoked_at = clock_timestamp()
    where i.id = p_invitation_id
    returning * into v_invitation;
  end if;

  insert into private.client_invitation_receipts (
    workspace_id, actor_user_id, request_id, command, payload,
    token_hash, invitation_id, expires_at
  ) values (
    v_workspace_id, v_actor_user_id, p_request_id, 'revoke', v_payload,
    null, v_invitation.id, v_invitation.expires_at
  );

  return jsonb_build_object(
    'invitation_id', v_invitation.id,
    'revoked', true,
    'replayed', false
  );
exception
  when unique_violation then
    raise exception 'Request id has already been used' using errcode = '22023';
end;
$$;

create function public.accept_invitation(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor_user_id uuid := auth.uid();
  v_token_hash text;
  v_client_record_id uuid;
  v_client public.client_records%rowtype;
  v_invitation public.invitations%rowtype;
  v_trainer_name text;
  v_accepted_at timestamptz;
  v_replayed boolean := false;
begin
  if v_actor_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$' then
    raise exception 'Invitation is unavailable' using errcode = 'P0002';
  end if;

  v_token_hash := encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex');

  select i.client_record_id into v_client_record_id
  from public.invitations i
  where i.token_hash = v_token_hash;

  if v_client_record_id is null then
    raise exception 'Invitation is unavailable' using errcode = 'P0002';
  end if;

  select * into v_client
  from public.client_records c
  where c.id = v_client_record_id
  for update;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = 'P0002';
  end if;

  select * into v_invitation
  from public.invitations i
  where i.token_hash = v_token_hash
    and i.client_record_id = v_client.id
  for update;

  if not found then
    raise exception 'Invitation is unavailable' using errcode = 'P0002';
  end if;

  select w.name into v_trainer_name
  from public.trainer_workspaces w
  where w.id = v_client.workspace_id;

  if v_invitation.accepted_at is not null then
    if v_invitation.accepted_by = v_actor_user_id and v_client.user_id = v_actor_user_id then
      v_accepted_at := v_invitation.accepted_at;
      v_replayed := true;
    else
      raise exception 'Invitation is unavailable' using errcode = 'P0002';
    end if;
  else
    if v_invitation.revoked_at is not null
      or v_invitation.expires_at <= clock_timestamp()
      or v_client.archived_at is not null
      or (v_client.user_id is not null and v_client.user_id <> v_actor_user_id) then
      raise exception 'Invitation is unavailable' using errcode = 'P0002';
    end if;

    update public.client_records c
    set user_id = v_actor_user_id
    where c.id = v_client.id
      and c.user_id is null;

    if not found and v_client.user_id <> v_actor_user_id then
      raise exception 'Invitation is unavailable' using errcode = 'P0002';
    end if;

    update public.invitations i
    set accepted_by = v_actor_user_id,
        accepted_at = clock_timestamp()
    where i.id = v_invitation.id
    returning i.accepted_at into v_accepted_at;
  end if;

  return jsonb_build_object(
    'accepted', true,
    'replayed', v_replayed,
    'client_record_id', v_client.id,
    'trainer_name', v_trainer_name,
    'accepted_at', v_accepted_at
  );
end;
$$;

revoke all on function public.issue_client_invitation(uuid, text, uuid) from public, anon;
revoke all on function public.revoke_client_invitation(uuid, uuid) from public, anon;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.issue_client_invitation(uuid, text, uuid) to authenticated;
grant execute on function public.revoke_client_invitation(uuid, uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

comment on function public.issue_client_invitation(uuid, text, uuid) is
  'Issues or replaces a client invitation. The caller supplies 32 cryptographically random bytes encoded as unpadded base64url; only its SHA-256 digest is stored. Reusing the same request id and token safely replays the original invitation metadata.';
comment on function public.revoke_client_invitation(uuid, uuid) is
  'Revokes an unused invitation owned by the authenticated trainer. Revoke retries are idempotent by request id.';
comment on function public.accept_invitation(text) is
  'Accepts a privately shared invitation for auth.uid(), linking the existing client record while preserving its history. Only the same authenticated user can replay an accepted invitation.';

commit;
