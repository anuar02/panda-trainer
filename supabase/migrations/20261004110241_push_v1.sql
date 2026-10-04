begin;

create table private.push_installations (
 device_id uuid primary key,
 device_secret_hash text not null,
 sequence bigint not null check(sequence between 1 and 9007199254740991)
);
alter table private.push_installations enable row level security;
revoke all on private.push_installations from public,anon,authenticated;
create function private.advance_push_installation(p_device uuid,p_secret text,p_sequence bigint)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare installation private.push_installations; digest text; inserted integer;
begin
 if p_secret is null or length(p_secret)<32 or p_sequence is null or p_sequence not between 1 and 9007199254740991 then raise exception 'push_unavailable' using errcode='42501'; end if;
 digest:=encode(extensions.digest(p_secret,'sha256'),'hex');
 insert into private.push_installations(device_id,device_secret_hash,sequence) values(p_device,digest,p_sequence) on conflict(device_id) do nothing;
 get diagnostics inserted=row_count;
 select * into installation from private.push_installations where device_id=p_device for update;
 if installation.device_secret_hash<>digest or installation.sequence>=p_sequence and inserted=0 then return false; end if;
 update private.push_installations set sequence=p_sequence where device_id=p_device;
 return true;
end; $$;
revoke all on function private.advance_push_installation(uuid,text,bigint) from public,anon,authenticated;

create table private.push_devices (
  device_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  device_secret_hash text not null,
  token text not null unique check (token ~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{10,200}\]$'),
  platform text not null check (platform in ('ios','android')),
  generation uuid not null,
  updated_at timestamptz not null default clock_timestamp()
);
create index push_devices_user_idx on private.push_devices(user_id);
alter table private.push_devices enable row level security;
create policy push_devices_own on private.push_devices to authenticated using (user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on private.push_devices from public,anon,authenticated;

create function public.register_push_device(p_device_id uuid,p_token text,p_platform text,p_generation uuid,p_device_secret text,p_sequence bigint)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare sid uuid:=(auth.jwt()->>'session_id')::uuid;
begin
  if auth.uid() is null or sid is null or p_generation is null or p_device_secret is null or length(p_device_secret)<32 then raise exception 'push_unavailable' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_device_id::text,0));
  if exists(select 1 from private.push_devices where device_id=p_device_id and device_secret_hash<>encode(extensions.digest(p_device_secret,'sha256'),'hex')) then raise exception 'push_unavailable' using errcode='42501'; end if;
  if not private.advance_push_installation(p_device_id,p_device_secret,p_sequence) then return; end if;
  insert into private.push_devices(device_id,user_id,session_id,token,platform,generation,device_secret_hash)
  values(p_device_id,auth.uid(),sid,p_token,p_platform,p_generation,encode(extensions.digest(p_device_secret,'sha256'),'hex'))
  on conflict(device_id) do update set user_id=excluded.user_id,session_id=excluded.session_id,token=excluded.token,platform=excluded.platform,generation=excluded.generation,updated_at=clock_timestamp();
end; $$;
create function public.unregister_push_device(p_device_id uuid,p_generation uuid,p_device_secret text,p_sequence bigint)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'push_unavailable' using errcode='42501'; end if;
 if not private.advance_push_installation(p_device_id,p_device_secret,p_sequence) then return; end if;
 delete from private.push_devices where device_id=p_device_id and user_id=auth.uid()
    and session_id=(auth.jwt()->>'session_id')::uuid and generation=p_generation and device_secret_hash=encode(extensions.digest(p_device_secret,'sha256'),'hex');
end; $$;
create function public.own_push_devices()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('device_id',device_id,'platform',platform,'updated_at',updated_at)),'[]'::jsonb)
  from private.push_devices where user_id=auth.uid();
$$;
revoke all on function public.register_push_device(uuid,text,text,uuid,text,bigint),public.unregister_push_device(uuid,uuid,text,bigint),public.own_push_devices() from public,anon,authenticated;
grant execute on function public.register_push_device(uuid,text,text,uuid,text,bigint),public.unregister_push_device(uuid,uuid,text,bigint),public.own_push_devices() to authenticated;

create function public.reconcile_push_device(p_device_id uuid,p_device_secret text,p_sequence bigint)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'push_unavailable' using errcode='42501'; end if;
 if not private.advance_push_installation(p_device_id,p_device_secret,p_sequence) then return; end if;
 delete from private.push_devices where device_id=p_device_id and device_secret_hash=encode(extensions.digest(p_device_secret,'sha256'),'hex');
end; $$;
revoke all on function public.reconcile_push_device(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reconcile_push_device(uuid,text,bigint) to authenticated;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check(kind in ('booking_requested','booking_confirmed','booking_cancelled','booking_rescheduled','reschedule_requested','reschedule_declined','reschedule_withdrawn','workout_finished','workout_corrected','booking_reminder','daily_plan'));

create table private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  device_id uuid not null,
  device_generation uuid not null,
  state text not null default 'pending' check(state in ('pending','sending','ticket','receipt','delivered','failed','cancelled','unknown')),
  attempts integer not null default 0,
  due_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_until timestamptz,
  ticket_id text,
  error_code text,
  unique(notification_id,device_id)
);
create index push_deliveries_due_idx on private.push_deliveries(due_at,id) where state in ('pending','ticket');
create index push_deliveries_lease_idx on private.push_deliveries(lease_until) where state in ('sending','receipt');
alter table private.push_deliveries enable row level security;
revoke all on private.push_deliveries from public,anon,authenticated;

create function private.push_eligible(p_notification uuid,p_now timestamptz)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.notifications n join public.client_records c on c.workspace_id=n.workspace_id and c.id=n.client_record_id
 join public.trainer_workspaces w on w.id=n.workspace_id
 where n.id=p_notification and (n.kind='daily_plan' or c.archived_at is null)
 and ((n.recipient_role='trainer' and n.recipient_user_id=w.owner_user_id) or (n.recipient_role='client' and n.recipient_user_id=c.user_id))
 and n.kind in ('booking_requested','booking_confirmed','booking_cancelled','booking_rescheduled','reschedule_requested','reschedule_declined','reschedule_withdrawn','booking_reminder','daily_plan')
 and (n.kind<>'booking_reminder' or exists(select 1 from public.bookings b where b.id=n.target_id and b.workspace_id=n.workspace_id and b.client_record_id=n.client_record_id and b.status='confirmed' and b.starts_at>p_now and n.event_key='reminder:'||b.id::text||':'||extract(epoch from b.starts_at)::text||':'||n.recipient_user_id::text))
 and (n.kind<>'daily_plan' or (n.recipient_role='trainer' and n.event_key='daily:'||(p_now at time zone w.timezone)::date::text and exists(
 select 1 from public.bookings b join public.client_records active on active.workspace_id=b.workspace_id and active.id=b.client_record_id
 where b.workspace_id=w.id and b.status='confirmed' and active.archived_at is null and (b.starts_at at time zone w.timezone)::date=(p_now at time zone w.timezone)::date))));
$$;

create function public.schedule_push_v1(p_now timestamptz,p_morning time)
returns integer language plpgsql security definer set search_path=pg_catalog as $$
declare added integer; summaries integer;
begin
 if p_now is null or p_morning is null then raise exception 'push_schedule_configuration_required'; end if;
 insert into public.notifications(workspace_id,recipient_user_id,recipient_role,client_record_id,event_key,kind,target_type,target_id,payload,created_at)
 select b.workspace_id,c.user_id,'client',c.id,'reminder:'||b.id::text||':'||extract(epoch from b.starts_at)::text||':'||c.user_id::text,'booking_reminder','booking',b.id,'{"version":1}',p_now
 from public.bookings b join public.client_records c on c.workspace_id=b.workspace_id and c.id=b.client_record_id
 where b.status='confirmed' and c.archived_at is null and c.user_id is not null and b.starts_at>p_now and b.starts_at<=p_now+interval '2 hours'
 on conflict(recipient_user_id,workspace_id,event_key) do nothing;
 get diagnostics added=row_count;
 insert into public.notifications(workspace_id,recipient_user_id,recipient_role,client_record_id,event_key,kind,target_type,target_id,payload,created_at)
 select distinct on(w.id) w.id,w.owner_user_id,'trainer',c.id,'daily:'||(p_now at time zone w.timezone)::date::text,'daily_plan','booking',b.id,'{"version":1}',p_now
 from public.trainer_workspaces w join public.bookings b on b.workspace_id=w.id join public.client_records c on c.workspace_id=w.id and c.id=b.client_record_id
 where (p_now at time zone w.timezone)::time>=p_morning and (b.starts_at at time zone w.timezone)::date=(p_now at time zone w.timezone)::date
 and b.status='confirmed' and c.archived_at is null order by w.id,b.starts_at,b.id
 on conflict(recipient_user_id,workspace_id,event_key) do nothing;
 get diagnostics summaries=row_count;
 return added+summaries;
end; $$;

create function public.claim_push_v1(p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; now_at timestamptz:=clock_timestamp();
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'invalid_push_batch'; end if;
 update private.push_deliveries set state='unknown',lease_id=null,lease_until=null,error_code='send_outcome_unknown'
 where state='sending' and lease_until<now_at;
 update private.push_deliveries set state='ticket',lease_id=null,lease_until=null where state='receipt' and lease_until<now_at;
 insert into private.push_deliveries(notification_id,device_id,device_generation)
 select n.id,d.device_id,d.generation from public.notifications n join private.push_devices d on d.user_id=n.recipient_user_id
 where n.created_at>=d.updated_at and n.created_at<=now_at and private.push_eligible(n.id,now_at)
 and not exists(select 1 from private.push_deliveries x where x.notification_id=n.id and x.device_id=d.device_id)
 order by n.created_at,n.id,d.device_id limit 500
 on conflict(notification_id,device_id) do nothing;
 now_at:=clock_timestamp();
 update private.push_deliveries set state='failed',error_code='receipt_unavailable' where state in ('pending','ticket') and attempts>=8;
 update private.push_deliveries x set state='cancelled',error_code='binding_or_target_changed'
 where x.state in ('pending','ticket') and (not private.push_eligible(x.notification_id,now_at) or not exists(select 1 from private.push_devices d join public.notifications n on n.id=x.notification_id where d.device_id=x.device_id and d.generation=x.device_generation and d.user_id=n.recipient_user_id));
 with candidates as (
 select x.id from private.push_deliveries x where x.state in ('pending','ticket') and x.due_at<=now_at and x.attempts<8 order by x.due_at,x.id for update skip locked limit p_limit
 ), claimed as (
 update private.push_deliveries x set state=case when x.state='ticket' then 'receipt' else 'sending' end,lease_id=gen_random_uuid(),lease_until=now_at+interval '2 minutes',attempts=x.attempts+1
 from candidates c where x.id=c.id returning x.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'lease',x.lease_id,'state',x.state,'ticket',x.ticket_id,'token',d.token,'notificationId',n.id,'workspaceId',n.workspace_id,'kind',n.kind,'summaryCount',case when n.kind='daily_plan' then (
 select count(*) from public.bookings b join public.client_records c on c.workspace_id=b.workspace_id and c.id=b.client_record_id
 join public.trainer_workspaces w on w.id=b.workspace_id where b.workspace_id=n.workspace_id and b.status='confirmed' and c.archived_at is null
 and (b.starts_at at time zone w.timezone)::date=(now_at at time zone w.timezone)::date) else null end)),'[]') into result
 from claimed x join public.notifications n on n.id=x.notification_id join private.push_devices d on d.device_id=x.device_id and d.generation=x.device_generation and d.user_id=n.recipient_user_id
 where private.push_eligible(n.id,now_at);
 return result;
end; $$;

create function public.complete_push_v1(p_id uuid,p_lease uuid,p_outcome text,p_ticket text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path=pg_catalog as $$
declare x private.push_deliveries; now_at timestamptz:=clock_timestamp();
begin
 select * into x from private.push_deliveries where id=p_id and lease_id=p_lease and lease_until>=now_at and state in ('sending','receipt') for update;
 if not found then return false; end if;
 if p_outcome not in ('ticket','delivered','retry','failed','invalid','unknown','waiting') or (p_outcome='ticket' and (x.state<>'sending' or p_ticket is null)) or (p_outcome in ('delivered','waiting') and x.state<>'receipt') then raise exception 'invalid_push_outcome'; end if;
 update private.push_deliveries set state=case p_outcome when 'invalid' then 'failed' when 'retry' then case when attempts>=8 then 'failed' when x.state='receipt' then 'ticket' else 'pending' end when 'waiting' then case when attempts>=8 then 'failed' else 'ticket' end else p_outcome end,
 attempts=case when p_outcome='ticket' then 0 else attempts end,ticket_id=coalesce(p_ticket,ticket_id),error_code=case when p_error in ('DeviceNotRegistered','MessageTooBig','MessageRateExceeded','MismatchSenderId','InvalidCredentials','send_outcome_unknown','transport_rejected','receipt_unavailable') then p_error else null end,
 due_at=now_at+case when p_outcome='ticket' then interval '15 minutes' else least(3600,30*power(2,attempts)) * interval '1 second' end,lease_id=null,lease_until=null where id=p_id;
 if p_outcome='invalid' then delete from private.push_devices where device_id=x.device_id and generation=x.device_generation; end if;
 return true;
end; $$;
create function public.open_push_notification(p_workspace_id uuid,p_notification_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare n public.notifications; target jsonb;
begin
 select * into n from public.notifications where id=p_notification_id and workspace_id=p_workspace_id and recipient_user_id=auth.uid();
 if not found or n.target_type<>'booking' then raise exception 'notification_unavailable' using errcode='P0002'; end if;
 target:=public.notification_target(p_workspace_id,p_notification_id);
 if n.kind='daily_plan' then
   target:=jsonb_set(target,'{current,date}',to_jsonb(substring(n.event_key from 7)));
 end if;
 return jsonb_build_object('role',n.recipient_role,'kind',n.kind,'target',target);
end; $$;
revoke all on function public.open_push_notification(uuid,uuid) from public,anon,authenticated;
grant execute on function public.open_push_notification(uuid,uuid) to authenticated;

revoke all on function private.push_eligible(uuid,timestamptz),public.schedule_push_v1(timestamptz,time),public.claim_push_v1(integer),public.complete_push_v1(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.schedule_push_v1(timestamptz,time),public.claim_push_v1(integer),public.complete_push_v1(uuid,uuid,text,text,text) to service_role;
commit;
