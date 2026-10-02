begin;

create table private.booking_creation_receipts (
  workspace_id uuid not null references public.trainer_workspaces(id) on delete restrict,
  request_id uuid not null,
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  result jsonb not null check(jsonb_typeof(result)='object'),
  created_at timestamptz not null default now(),
  primary key(workspace_id,request_id)
);
alter table private.booking_creation_receipts enable row level security;
revoke all on private.booking_creation_receipts from public,anon,authenticated;

-- Existing creation anchors still have their original group membership at this migration.
insert into private.booking_creation_receipts(workspace_id,request_id,payload,result,created_at)
select anchor.workspace_id,anchor.request_id,anchor.request_payload,
  jsonb_build_object('created',true,'group_session_id',anchor.group_session_id,
    'booking_ids',case when anchor.group_session_id is null then jsonb_build_array(anchor.id) else
      (select jsonb_agg(member.id order by member.client_record_id) from public.bookings member
       where member.workspace_id=anchor.workspace_id and member.group_session_id=anchor.group_session_id) end,
    'overlaps','[]'::jsonb,'replayed',false),anchor.created_at
from public.bookings anchor where anchor.request_id is not null;

alter function public.create_booking_set_with_plan(uuid[],timestamptz,timestamptz,boolean,uuid,uuid,integer)
  set schema private;
alter function private.create_booking_set_with_plan(uuid[],timestamptz,timestamptz,boolean,uuid,uuid,integer)
  rename to create_booking_set_with_plan_impl;
revoke all on function private.create_booking_set_with_plan_impl(uuid[],timestamptz,timestamptz,boolean,uuid,uuid,integer)
  from public,anon,authenticated;

create function public.create_booking_set_with_plan(
  p_client_record_ids uuid[],p_starts_at timestamptz,p_ends_at timestamptz,
  p_collision_ack boolean,p_request_id uuid,p_template_id uuid,p_expected_template_revision integer
)
returns jsonb language plpgsql security definer set search_path=pg_catalog
as $$
declare
  v_workspace uuid;
  v_client_ids uuid[];
  v_payload jsonb;
  v_receipt private.booking_creation_receipts%rowtype;
  v_result jsonb;
begin
  if auth.uid() is null then raise exception 'trainer authentication required' using errcode='42501'; end if;
  select w.id into v_workspace from public.trainer_workspaces w where w.owner_user_id=auth.uid() for update;
  if not found then raise exception 'trainer workspace required' using errcode='42501'; end if;
  if p_client_record_ids is null or cardinality(p_client_record_ids)=0
    or p_starts_at is null or p_ends_at is null or p_collision_ack is null or p_request_id is null then
    raise exception 'invalid booking request' using errcode='22023';
  end if;
  if cardinality(p_client_record_ids)<>(select count(distinct id) from unnest(p_client_record_ids) requested(id)) then
    raise exception 'duplicate client record' using errcode='22023';
  end if;
  if (p_template_id is null)<>(p_expected_template_revision is null) or p_expected_template_revision<1 then
    raise exception 'invalid template selection' using errcode='22023';
  end if;
  select array_agg(id order by id) into v_client_ids from unnest(p_client_record_ids) requested(id);
  v_payload:=jsonb_build_object('client_record_ids',to_jsonb(v_client_ids),
    'starts_epoch',extract(epoch from p_starts_at),'ends_epoch',extract(epoch from p_ends_at),
    'collision_ack',p_collision_ack);
  if p_template_id is not null then
    v_payload:=v_payload || jsonb_build_object('template_id',p_template_id,
      'expected_template_revision',p_expected_template_revision);
  end if;
  select r.* into v_receipt from private.booking_creation_receipts r
    where r.workspace_id=v_workspace and r.request_id=p_request_id;
  if found then
    if v_receipt.payload<>v_payload then raise exception 'request id payload mismatch' using errcode='22023'; end if;
    return v_receipt.result || jsonb_build_object('replayed',true,'overlaps','[]'::jsonb);
  end if;
  v_result:=private.create_booking_set_with_plan_impl(v_client_ids,p_starts_at,p_ends_at,
    p_collision_ack,p_request_id,p_template_id,p_expected_template_revision);
  if (v_result->>'created')::boolean then
    insert into private.booking_creation_receipts(workspace_id,request_id,payload,result)
      values(v_workspace,p_request_id,v_payload,v_result);
  end if;
  return v_result;
end;
$$;

-- Rebind the legacy wrapper after moving its former callee into the private schema.
create or replace function public.create_booking_set(
  p_client_record_ids uuid[],p_starts_at timestamptz,p_ends_at timestamptz,
  p_collision_ack boolean,p_request_id uuid
)
returns jsonb language sql security definer set search_path=pg_catalog
as $$ select public.create_booking_set_with_plan(p_client_record_ids,p_starts_at,p_ends_at,
  p_collision_ack,p_request_id,null,null); $$;
revoke all on function public.create_booking_set_with_plan(uuid[],timestamptz,timestamptz,boolean,uuid,uuid,integer)
  from public,anon;
grant execute on function public.create_booking_set_with_plan(uuid[],timestamptz,timestamptz,boolean,uuid,uuid,integer)
  to authenticated;

commit;
