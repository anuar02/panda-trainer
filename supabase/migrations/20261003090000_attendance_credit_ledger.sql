begin;

alter table public.bookings add constraint bookings_workspace_client_id_key unique (workspace_id, client_record_id, id);

create table public.client_purchases (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 client_record_id uuid not null, title text not null check (length(btrim(title)) between 1 and 200),
 units integer not null check (units > 0), price_minor bigint not null check (price_minor >= 0),
 currency text not null default 'KZT' check (currency = 'KZT'), expires_on date,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
 unique (workspace_id, client_record_id, id),
 foreign key (workspace_id, client_record_id) references public.client_records(workspace_id,id) on delete restrict
);
create table public.attendance_records (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, client_record_id uuid not null,
 booking_id uuid not null, service_date date not null, status text not null check (status in ('present','noshow','undone')),
 revision integer not null default 1 check (revision > 0), cycle integer not null default 1 check (cycle > 0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique (workspace_id,client_record_id,id), unique (workspace_id,client_record_id,booking_id,id), unique (workspace_id,booking_id),
 foreign key (workspace_id,client_record_id,booking_id) references public.bookings(workspace_id,client_record_id,id) on delete restrict
);
create table public.attendance_revisions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, client_record_id uuid not null,
 attendance_id uuid not null, revision integer not null check (revision > 0), cycle integer not null check (cycle > 0),
 status text not null check (status in ('present','noshow','undone')), service_date date not null, reason text,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
 unique (workspace_id,attendance_id,revision),
 foreign key (workspace_id,client_record_id,attendance_id) references public.attendance_records(workspace_id,client_record_id,id) on delete restrict
);
create table public.credit_entries (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, client_record_id uuid not null,
 purchase_id uuid not null, attendance_id uuid, booking_id uuid, cycle integer,
 kind text not null check (kind in ('grant','consume','restore','charge_late_cancel')),
 units integer not null, reason text, reverses_entry_id uuid,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id) on delete restrict,
 unique (workspace_id,client_record_id,purchase_id,id),
 foreign key (workspace_id,client_record_id,purchase_id) references public.client_purchases(workspace_id,client_record_id,id) on delete restrict,
 foreign key (workspace_id,client_record_id,booking_id,attendance_id) references public.attendance_records(workspace_id,client_record_id,booking_id,id) on delete restrict,
 foreign key (workspace_id,client_record_id,booking_id) references public.bookings(workspace_id,client_record_id,id) on delete restrict,
 foreign key (workspace_id,client_record_id,purchase_id,reverses_entry_id) references public.credit_entries(workspace_id,client_record_id,purchase_id,id) on delete restrict,
 check ((kind = 'grant' and units > 0 and attendance_id is null and booking_id is null and cycle is null and reverses_entry_id is null)
 or (kind = 'consume' and units = -1 and attendance_id is not null and booking_id is not null and cycle is not null and cycle > 0 and reverses_entry_id is null)
 or (kind = 'restore' and units = 1 and attendance_id is not null and booking_id is not null and cycle is not null and cycle > 0 and reverses_entry_id is not null)
 or (kind = 'charge_late_cancel' and units = -1 and booking_id is not null and reverses_entry_id is null and reason is not null and length(btrim(reason)) > 0))
);
create unique index credit_one_grant on public.credit_entries(purchase_id) where kind = 'grant';
create unique index credit_one_consume_cycle on public.credit_entries(attendance_id,cycle) where kind = 'consume';
create unique index credit_one_restore on public.credit_entries(reverses_entry_id) where kind = 'restore';
create unique index credit_one_penalty on public.credit_entries(booking_id) where kind = 'charge_late_cancel' and attendance_id is null;
create unique index credit_one_penalty_cycle on public.credit_entries(attendance_id,cycle) where kind = 'charge_late_cancel' and attendance_id is not null;
create table private.billing_command_receipts (
 workspace_id uuid not null references public.trainer_workspaces(id) on delete restrict,
 actor_user_id uuid not null references auth.users(id) on delete restrict, request_id uuid not null,
 command text not null, payload jsonb not null, result jsonb not null, created_at timestamptz not null default now(),
 primary key(workspace_id,actor_user_id,request_id)
);

create function private.reject_billing_history_mutation() returns trigger language plpgsql set search_path = pg_catalog as $$
begin raise exception 'Billing history is immutable' using errcode = '55000'; end;
$$;
create trigger purchases_immutable before update or delete on public.client_purchases for each row execute function private.reject_billing_history_mutation();
create trigger credit_immutable before update or delete on public.credit_entries for each row execute function private.reject_billing_history_mutation();
create trigger attendance_history_immutable before update or delete on public.attendance_revisions for each row execute function private.reject_billing_history_mutation();
create trigger attendance_no_delete before delete on public.attendance_records for each row execute function private.reject_billing_history_mutation();
create trigger billing_receipts_immutable before update or delete on private.billing_command_receipts for each row execute function private.reject_billing_history_mutation();

alter table public.client_purchases enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_revisions enable row level security;
alter table public.credit_entries enable row level security;
alter table private.billing_command_receipts enable row level security;
create policy purchase_read on public.client_purchases for select to authenticated using (public.is_workspace_owner(workspace_id) or client_record_id in (select public.my_client_record_ids()));
create policy attendance_read on public.attendance_records for select to authenticated using (public.is_workspace_owner(workspace_id) or client_record_id in (select public.my_client_record_ids()));
create policy attendance_history_read on public.attendance_revisions for select to authenticated using (public.is_workspace_owner(workspace_id) or client_record_id in (select public.my_client_record_ids()));
create policy credit_read on public.credit_entries for select to authenticated using (public.is_workspace_owner(workspace_id) or client_record_id in (select public.my_client_record_ids()));
revoke all on public.client_purchases, public.attendance_records, public.attendance_revisions, public.credit_entries, private.billing_command_receipts from public, anon, authenticated;
grant select(id,workspace_id,client_record_id,title,units,price_minor,currency,expires_on,created_at) on public.client_purchases to authenticated;
grant select(id,workspace_id,client_record_id,booking_id,service_date,status,revision,cycle,created_at,updated_at) on public.attendance_records to authenticated;
grant select(id,workspace_id,client_record_id,attendance_id,revision,cycle,status,service_date,reason,created_at) on public.attendance_revisions to authenticated;
grant select(id,workspace_id,client_record_id,purchase_id,attendance_id,booking_id,cycle,kind,units,reason,reverses_entry_id,created_at) on public.credit_entries to authenticated;

create function public.create_client_purchase(p_client_record_id uuid,p_title text,p_units integer,p_price_minor bigint,p_request_id uuid,p_expires_on date default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare v_actor uuid := auth.uid(); v_workspace uuid; v_id uuid; v_payload jsonb; v_result jsonb; v_receipt private.billing_command_receipts%rowtype;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id into v_workspace from public.trainer_workspaces where owner_user_id=v_actor for update;
 if v_workspace is null then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Invalid purchase request' using errcode='22023'; end if;
 v_payload := jsonb_build_object('client_record_id',p_client_record_id,'title',p_title,'units',p_units,'price_minor',p_price_minor,'expires_on',p_expires_on);
 select * into v_receipt from private.billing_command_receipts where workspace_id=v_workspace and actor_user_id=v_actor and request_id=p_request_id;
 if found then
  if v_receipt.command <> 'create_client_purchase' or v_receipt.payload <> v_payload then raise exception 'Request id payload mismatch' using errcode='22023'; end if;
  return v_receipt.result || jsonb_build_object('replayed',true);
 end if;
 if p_title is null or length(btrim(p_title)) not between 1 and 200 or p_units is null or p_units<1 or p_price_minor is null or p_price_minor<0 then raise exception 'Invalid purchase request' using errcode='22023'; end if;
 if not exists(select 1 from public.client_records where workspace_id=v_workspace and id=p_client_record_id and archived_at is null) then raise exception 'Client unavailable' using errcode='P0002'; end if;
 insert into public.client_purchases(workspace_id,client_record_id,title,units,price_minor,expires_on,created_by) values(v_workspace,p_client_record_id,btrim(p_title),p_units,p_price_minor,p_expires_on,v_actor) returning id into v_id;
 insert into public.credit_entries(workspace_id,client_record_id,purchase_id,kind,units,created_by) values(v_workspace,p_client_record_id,v_id,'grant',p_units,v_actor);
 v_result:=jsonb_build_object('purchase_id',v_id,'workspace_id',v_workspace,'client_record_id',p_client_record_id);
 insert into private.billing_command_receipts(workspace_id,actor_user_id,request_id,command,payload,result) values(v_workspace,v_actor,p_request_id,'create_client_purchase',v_payload,v_result);
 return v_result || jsonb_build_object('replayed',false);
end; $$;

create function private.apply_attendance_command(p_command text,p_booking_id uuid,p_attendance_id uuid,p_expected_booking_revision integer,p_expected_attendance_revision integer,p_request_id uuid,p_charge boolean,p_purchase_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
 v_actor uuid:=auth.uid(); v_workspace uuid; v_timezone text; v_payload jsonb; v_result jsonb;
 v_receipt private.billing_command_receipts%rowtype; v_booking public.bookings%rowtype;
 v_attendance public.attendance_records%rowtype; v_entry public.credit_entries%rowtype;
 v_purchase uuid; v_credit uuid; v_date date; v_status text; v_charged boolean:=false;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select id,timezone into v_workspace,v_timezone from public.trainer_workspaces where owner_user_id=v_actor for update;
 if v_workspace is null then raise exception 'Workspace unavailable' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Invalid attendance command' using errcode='22023'; end if;
 v_payload:=jsonb_build_object('command',p_command,'booking_id',p_booking_id,'attendance_id',p_attendance_id,'expected_booking_revision',p_expected_booking_revision,'expected_attendance_revision',p_expected_attendance_revision,'charge',p_charge,'purchase_id',p_purchase_id,'reason',p_reason);
 select * into v_receipt from private.billing_command_receipts where workspace_id=v_workspace and actor_user_id=v_actor and request_id=p_request_id;
 if found then
  if v_receipt.command<>p_command or v_receipt.payload<>v_payload then raise exception 'Request id payload mismatch' using errcode='22023'; end if;
  return v_receipt.result || jsonb_build_object('replayed',true);
 end if;
 if p_command not in ('mark_attended','mark_no_show','bind_attendance_purchase','undo_attendance','charge_late_cancellation') or p_expected_booking_revision is null or p_expected_booking_revision<1 or p_charge is null then raise exception 'Invalid attendance command' using errcode='22023'; end if;
 if p_attendance_id is not null then
  select * into v_attendance from public.attendance_records where workspace_id=v_workspace and id=p_attendance_id;
  if not found then raise exception 'Attendance unavailable' using errcode='P0002'; end if;
  select * into v_booking from public.bookings where workspace_id=v_workspace and id=v_attendance.booking_id for update;
 else
  select * into v_booking from public.bookings where workspace_id=v_workspace and id=p_booking_id for update;
 end if;
 if v_booking.id is null then raise exception 'Booking unavailable' using errcode='P0002'; end if;
 if v_booking.revision<>p_expected_booking_revision then raise exception 'Booking revision is stale' using errcode='40001'; end if;
 if not exists(select 1 from public.client_records where workspace_id=v_workspace and id=v_booking.client_record_id and archived_at is null) then raise exception 'Client unavailable' using errcode='P0002'; end if;
 select * into v_attendance from public.attendance_records where workspace_id=v_workspace and booking_id=v_booking.id for update;
 if p_command in ('bind_attendance_purchase','undo_attendance') then
  if v_attendance.id is null then raise exception 'Attendance unavailable' using errcode='P0002'; end if;
  if p_expected_attendance_revision is null or p_expected_attendance_revision<1 then raise exception 'Invalid attendance revision' using errcode='22023'; end if;
  if v_attendance.revision<>p_expected_attendance_revision then raise exception 'Attendance revision is stale' using errcode='40001'; end if;
 end if;
 v_date:=case when p_command='bind_attendance_purchase' or (p_command='charge_late_cancellation' and v_attendance.status='noshow') then v_attendance.service_date else (v_booking.starts_at at time zone v_timezone)::date end;
 if p_command='undo_attendance' then
  if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Public reason required' using errcode='22023'; end if;
  if v_attendance.status='undone' then raise exception 'Attendance already undone' using errcode='55000'; end if;
  select * into v_entry from public.credit_entries where attendance_id=v_attendance.id and cycle=v_attendance.cycle and kind in ('consume','charge_late_cancel');
  if found then
   insert into public.credit_entries(workspace_id,client_record_id,purchase_id,attendance_id,booking_id,cycle,kind,units,reason,reverses_entry_id,created_by)
   values(v_workspace,v_booking.client_record_id,v_entry.purchase_id,v_attendance.id,v_booking.id,v_attendance.cycle,'restore',1,btrim(p_reason),v_entry.id,v_actor) returning id into v_credit;
   v_purchase:=v_entry.purchase_id;
  end if;
  update public.attendance_records set status='undone',revision=revision+1,updated_at=clock_timestamp() where id=v_attendance.id returning * into v_attendance;
 else
  if p_command='charge_late_cancellation' then
   if v_attendance.status='present' or exists(select 1 from public.credit_entries e where e.booking_id=v_booking.id and e.kind='consume' and not exists(select 1 from public.credit_entries r where r.reverses_entry_id=e.id)) then raise exception 'Present attendance already accounts for this booking' using errcode='55000'; end if;
   if p_reason is null or length(btrim(p_reason)) not between 1 and 1000 then raise exception 'Public reason required' using errcode='22023'; end if;
   if v_booking.status not in ('cancelled_by_client','cancelled_by_trainer') and (v_attendance.id is null or v_attendance.status<>'noshow') then raise exception 'Cancellation or no-show required' using errcode='55000'; end if;
   if exists(select 1 from public.credit_entries e where e.booking_id=v_booking.id and e.kind='charge_late_cancel' and not exists(select 1 from public.credit_entries r where r.reverses_entry_id=e.id)) then raise exception 'Booking already charged' using errcode='55000'; end if;
  else
   if v_booking.status not in ('proposed','confirmed') then raise exception 'Cancelled booking cannot have attendance' using errcode='55000'; end if;
   if p_command in ('mark_attended','mark_no_show') then
    if v_attendance.id is not null and v_attendance.status<>'undone' then raise exception 'Attendance already marked' using errcode='55000'; end if;
    v_status:=case when p_command='mark_attended' then 'present' else 'noshow' end;
    if v_attendance.id is null then
     insert into public.attendance_records(workspace_id,client_record_id,booking_id,service_date,status) values(v_workspace,v_booking.client_record_id,v_booking.id,v_date,v_status) returning * into v_attendance;
    else
     update public.attendance_records set status=v_status,service_date=v_date,revision=revision+1,cycle=cycle+1,updated_at=clock_timestamp() where id=v_attendance.id returning * into v_attendance;
    end if;
   elsif v_attendance.status<>'present' then raise exception 'Only present attendance can be bound' using errcode='55000';
   end if;
   if p_command='bind_attendance_purchase' and exists(select 1 from public.credit_entries where attendance_id=v_attendance.id and cycle=v_attendance.cycle and kind='consume') then raise exception 'Attendance already bound' using errcode='55000'; end if;
  end if;
  if (p_command='mark_attended' and p_charge) or p_command in ('bind_attendance_purchase','charge_late_cancellation') then
   if p_command<>'charge_late_cancellation' and exists(select 1 from public.credit_entries e where e.booking_id=v_booking.id and e.kind='charge_late_cancel' and not exists(select 1 from public.credit_entries r where r.reverses_entry_id=e.id)) then raise exception 'Booking already has an active penalty' using errcode='55000'; end if;
   select p.id into v_purchase from public.client_purchases p
   where p.workspace_id=v_workspace and p.client_record_id=v_booking.client_record_id
    and (p_purchase_id is null or p.id=p_purchase_id) and (p.expires_on is null or p.expires_on>=v_date)
    and (select coalesce(sum(e.units),0) from public.credit_entries e where e.purchase_id=p.id)>0
   order by p.expires_on asc nulls last,p.created_at,p.id limit 1 for update;
   if v_purchase is null and (p_purchase_id is not null or p_command='charge_late_cancellation') then raise exception 'Eligible purchase unavailable' using errcode='55000'; end if;
   if v_purchase is not null then
    insert into public.credit_entries(workspace_id,client_record_id,purchase_id,attendance_id,booking_id,cycle,kind,units,reason,created_by)
    values(v_workspace,v_booking.client_record_id,v_purchase,case when p_command='charge_late_cancellation' and v_attendance.status is distinct from 'noshow' then null else v_attendance.id end,v_booking.id,case when p_command='charge_late_cancellation' and v_attendance.status is distinct from 'noshow' then null else v_attendance.cycle end,case when p_command='charge_late_cancellation' then 'charge_late_cancel' else 'consume' end,-1,case when p_command='charge_late_cancellation' then btrim(p_reason) end,v_actor) returning id into v_credit;
    v_charged:=true;
    if p_command='bind_attendance_purchase' then update public.attendance_records set revision=revision+1,updated_at=clock_timestamp() where id=v_attendance.id returning * into v_attendance; end if;
   end if;
  elsif p_purchase_id is not null then raise exception 'Purchase requires explicit charge' using errcode='22023';
  end if;
 end if;
 if p_command<>'charge_late_cancellation' and (p_command<>'bind_attendance_purchase' or v_charged) then
  insert into public.attendance_revisions(workspace_id,client_record_id,attendance_id,revision,cycle,status,service_date,reason,created_by) values(v_workspace,v_booking.client_record_id,v_attendance.id,v_attendance.revision,v_attendance.cycle,v_attendance.status,v_attendance.service_date,case when p_command='undo_attendance' then btrim(p_reason) end,v_actor);
 end if;
 v_result:=jsonb_build_object('attendance_id',v_attendance.id,'booking_id',v_booking.id,'revision',v_attendance.revision,'status',v_attendance.status,'cycle',v_attendance.cycle,'service_date',v_attendance.service_date,'purchase_id',v_purchase,'charged',v_charged,'credit_entry_id',v_credit);
 insert into private.billing_command_receipts(workspace_id,actor_user_id,request_id,command,payload,result) values(v_workspace,v_actor,p_request_id,p_command,v_payload,v_result);
 return v_result || jsonb_build_object('replayed',false);
end; $$;

create function public.mark_attended(p_booking_id uuid,p_expected_booking_revision integer,p_request_id uuid,p_charge boolean default false,p_purchase_id uuid default null) returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_attendance_command('mark_attended',p_booking_id,null,p_expected_booking_revision,null,p_request_id,p_charge,p_purchase_id,null); $$;
create function public.mark_no_show(p_booking_id uuid,p_expected_booking_revision integer,p_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_attendance_command('mark_no_show',p_booking_id,null,p_expected_booking_revision,null,p_request_id,false,null,null); $$;
create function public.bind_attendance_purchase(p_attendance_id uuid,p_expected_attendance_revision integer,p_expected_booking_revision integer,p_request_id uuid,p_purchase_id uuid default null) returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_attendance_command('bind_attendance_purchase',null,p_attendance_id,p_expected_booking_revision,p_expected_attendance_revision,p_request_id,true,p_purchase_id,null); $$;
create function public.undo_attendance(p_attendance_id uuid,p_expected_attendance_revision integer,p_expected_booking_revision integer,p_reason text,p_request_id uuid) returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_attendance_command('undo_attendance',null,p_attendance_id,p_expected_booking_revision,p_expected_attendance_revision,p_request_id,false,null,p_reason); $$;
create function public.charge_late_cancellation(p_booking_id uuid,p_expected_booking_revision integer,p_reason text,p_request_id uuid,p_purchase_id uuid default null) returns jsonb language sql security definer set search_path=pg_catalog as $$ select private.apply_attendance_command('charge_late_cancellation',p_booking_id,null,p_expected_booking_revision,null,p_request_id,true,p_purchase_id,p_reason); $$;
revoke all on function private.reject_billing_history_mutation(),private.apply_attendance_command(text,uuid,uuid,integer,integer,uuid,boolean,uuid,text) from public,anon,authenticated;
revoke all on function public.create_client_purchase(uuid,text,integer,bigint,uuid,date),public.mark_attended(uuid,integer,uuid,boolean,uuid),public.mark_no_show(uuid,integer,uuid),public.bind_attendance_purchase(uuid,integer,integer,uuid,uuid),public.undo_attendance(uuid,integer,integer,text,uuid),public.charge_late_cancellation(uuid,integer,text,uuid,uuid) from public,anon;
grant execute on function public.create_client_purchase(uuid,text,integer,bigint,uuid,date),public.mark_attended(uuid,integer,uuid,boolean,uuid),public.mark_no_show(uuid,integer,uuid),public.bind_attendance_purchase(uuid,integer,integer,uuid,uuid),public.undo_attendance(uuid,integer,integer,text,uuid),public.charge_late_cancellation(uuid,integer,text,uuid,uuid) to authenticated;
commit;
