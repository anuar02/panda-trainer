begin;

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.trainer_workspaces(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('trainer','client')),
  client_record_id uuid not null,
  event_key text not null check (length(event_key) between 1 and 200),
  kind text not null check (kind in ('booking_requested','booking_confirmed','booking_cancelled','booking_rescheduled','reschedule_requested','reschedule_declined','reschedule_withdrawn','workout_finished','workout_corrected')),
  target_type text not null check (target_type in ('booking','workout')),
  target_id uuid not null,
  check ((target_type='workout') = (kind in ('workout_finished','workout_corrected'))),
  payload jsonb not null check (payload = '{"version":1}'::jsonb),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (recipient_user_id, workspace_id, event_key),
  foreign key (workspace_id, client_record_id) references public.client_records(workspace_id,id) on delete cascade
);
create index notifications_feed_idx on public.notifications(recipient_user_id,workspace_id,created_at desc,id desc);
create index notifications_unread_idx on public.notifications(recipient_user_id,workspace_id) where read_at is null;
alter table public.notifications enable row level security;
create policy notifications_own_read on public.notifications for select to authenticated using (
  recipient_user_id = (select auth.uid()) and (
    (recipient_role='trainer' and public.is_workspace_owner(workspace_id))
    or (recipient_role='client' and exists(select 1 from public.client_records c
      where c.workspace_id=notifications.workspace_id and c.id=notifications.client_record_id
      and c.user_id=(select auth.uid()) and c.archived_at is null))
  )
);
revoke all on public.notifications from public,anon,authenticated;
grant select on public.notifications to authenticated;

create function private.emit_notification(p_workspace uuid,p_client uuid,p_key text,p_kind text,p_type text,p_target uuid,p_actor uuid)
returns void language sql security definer set search_path=pg_catalog as $$
  insert into public.notifications(workspace_id,recipient_user_id,recipient_role,client_record_id,event_key,kind,target_type,target_id,payload)
  select p_workspace,r.user_id,r.role,p_client,p_key,p_kind,p_type,p_target,'{"version":1}'::jsonb
  from public.client_records c join public.trainer_workspaces w on w.id=c.workspace_id
  cross join lateral (values (w.owner_user_id,'trainer'),(c.user_id,'client')) r(user_id,role)
  where c.workspace_id=p_workspace and c.id=p_client and c.archived_at is null
    and r.user_id is not null and r.user_id is distinct from p_actor
    and (p_type<>'workout' or r.role='client')
  on conflict (recipient_user_id,workspace_id,event_key) do nothing;
$$;
revoke all on function private.emit_notification(uuid,uuid,text,text,text,uuid,uuid) from public,anon,authenticated;

create function private.notification_booking_event()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare k text;
begin
  if tg_op='INSERT' then
    k:=case new.status when 'confirmed' then 'booking_confirmed' else 'booking_requested' end;
  elsif new.status is distinct from old.status then
    k:=case when new.status='confirmed' then 'booking_confirmed'
      when new.status in ('cancelled_by_client','cancelled_by_trainer') then 'booking_cancelled' else null end;
  elsif new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    k:='booking_rescheduled';
  end if;
  if k is not null then
    perform private.emit_notification(new.workspace_id,new.client_record_id,
      'booking:'||new.id::text||':'||new.revision::text,k,'booking',new.id,auth.uid());
  end if;
  return new;
end; $$;
create trigger notification_booking_event after insert or update on public.bookings for each row execute function private.notification_booking_event();

create function private.notification_proposal_event()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare b public.bookings; k text;
begin
  if tg_op='INSERT' then k:='reschedule_requested';
  elsif new.status='pending' and (new.proposed_starts_at is distinct from old.proposed_starts_at or new.author_user_id is distinct from old.author_user_id) then k:='reschedule_requested';
  elsif new.status is distinct from old.status then
    k:=case new.status when 'declined' then 'reschedule_declined' when 'withdrawn' then 'reschedule_withdrawn' else null end;
  end if;
  if k is not null then
    select * into b from public.bookings where workspace_id=new.workspace_id and id=new.booking_id;
    perform private.emit_notification(new.workspace_id,b.client_record_id,
      'proposal:'||new.id::text||':'||new.revision::text,k,'booking',new.booking_id,auth.uid());
  end if;
  return new;
end; $$;
create trigger notification_proposal_event after insert or update on public.schedule_proposals for each row execute function private.notification_proposal_event();

create function private.notification_finished_event()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.finished_at is not null and (tg_op='INSERT' or old.finished_at is null) then
    perform private.emit_notification(new.workspace_id,new.client_record_id,
      'finished:'||new.id::text,'workout_finished','workout',new.id,auth.uid());
  end if;
  return new;
end; $$;
create trigger notification_finished_event after insert or update on public.workout_instances for each row execute function private.notification_finished_event();

create function private.notification_correction_event()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare w public.workout_instances; k text; conflict_kind text; conflict_entity uuid;
begin
  select * into w from public.workout_instances where workspace_id=new.workspace_id and id=new.workout_id;
  k:=new.operation->>'kind';
  if k='resolve_conflict' then
    select kind,entity_id into conflict_kind,conflict_entity from public.workout_sync_conflicts where workspace_id=new.workspace_id and id=(new.operation->'payload'->>'conflict_id')::uuid;
  end if;
  if w.finished_at is not null and (k in ('upsert_set','delete_set','add_exercise','replace_exercise')
    or (k='resolve_conflict' and conflict_kind in ('upsert_set','delete_set','add_exercise','replace_exercise'))
    or (k='resolve_conflict' and conflict_kind='set_note' and (exists(select 1 from public.session_notes n where n.workspace_id=w.workspace_id and n.workout_instance_id=w.id and n.id=conflict_entity) or new.before_version->'conflict'->'current_version'->>'shared'='true'))
    or (k='set_note' and (exists(select 1 from public.session_notes n where n.workspace_id=w.workspace_id and n.id=(new.operation->>'entity_id')::uuid)
      or new.before_version->'current_version'->'entity'->>'shared'='true'))) then
    perform private.emit_notification(w.workspace_id,w.client_record_id,
      'correction:'||new.request_id::text,'workout_corrected','workout',w.id,new.user_id);
  end if;
  return new;
end; $$;
create trigger notification_correction_event after insert on private.workout_correction_audit for each row execute function private.notification_correction_event();
revoke all on function private.notification_booking_event(),private.notification_proposal_event(),private.notification_finished_event(),private.notification_correction_event() from public,anon,authenticated;

create function public.notification_feed(p_workspace_id uuid,p_client_record_id uuid default null,p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare rows jsonb; more boolean; unread bigint;
begin
  if auth.uid() is null then raise exception 'notification_unavailable' using errcode='42501'; end if;
  if p_workspace_id is null or p_limit is null or p_limit not between 1 and 50 or ((p_before_at is null)<>(p_before_id is null)) then raise exception 'invalid_notification_page' using errcode='22023'; end if;
  select count(*) into unread from public.notifications n where n.workspace_id=p_workspace_id and n.recipient_role=case when p_client_record_id is null then 'trainer' else 'client' end and (p_client_record_id is null or n.client_record_id=p_client_record_id) and n.read_at is null;
  with page as (
    select n.* from public.notifications n where n.workspace_id=p_workspace_id and n.recipient_role=case when p_client_record_id is null then 'trainer' else 'client' end and (p_client_record_id is null or n.client_record_id=p_client_record_id)
      and (p_before_at is null or (n.created_at,n.id)<(p_before_at,p_before_id))
    order by n.created_at desc,n.id desc limit p_limit+1
  ), numbered as (select p.*,row_number() over(order by p.created_at desc,p.id desc) as pos from page p)
  select coalesce(jsonb_agg(to_jsonb(n)-'pos' order by n.created_at desc,n.id desc) filter(where pos<=p_limit),'[]'::jsonb),coalesce(bool_or(pos>p_limit),false) into rows,more from numbered n;
  return jsonb_build_object('rows',rows,'has_more',more,'unread_count',unread);
end; $$;

create function public.mark_notification_read(p_workspace_id uuid,p_notification_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare n public.notifications;
begin
  update public.notifications t set read_at=coalesce(t.read_at,clock_timestamp())
  where t.id=p_notification_id and t.workspace_id=p_workspace_id and t.recipient_user_id=auth.uid()
    and ((t.recipient_role='trainer' and public.is_workspace_owner(t.workspace_id)) or
      (t.recipient_role='client' and exists(select 1 from public.client_records c where c.workspace_id=t.workspace_id and c.id=t.client_record_id and c.user_id=auth.uid() and c.archived_at is null)))
  returning * into n;
  if not found then raise exception 'notification_unavailable' using errcode='P0002'; end if;
  return to_jsonb(n);
end; $$;

create function public.notification_target(p_workspace_id uuid,p_notification_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare n public.notifications; available boolean; current_value jsonb;
begin
  select * into n from public.notifications t where t.workspace_id=p_workspace_id and t.id=p_notification_id and t.recipient_user_id=auth.uid() and ((t.recipient_role='trainer' and public.is_workspace_owner(t.workspace_id)) or (t.recipient_role='client' and exists(select 1 from public.client_records c where c.workspace_id=t.workspace_id and c.id=t.client_record_id and c.user_id=auth.uid() and c.archived_at is null)));
  if not found then raise exception 'notification_unavailable' using errcode='P0002'; end if;
  if n.target_type='booking' then
    select jsonb_build_object('status',b.status,'starts_at',b.starts_at,'ends_at',b.ends_at,'date',(b.starts_at at time zone w.timezone)::date) into current_value from public.bookings b join public.trainer_workspaces w on w.id=b.workspace_id where b.workspace_id=n.workspace_id and b.id=n.target_id and b.client_record_id=n.client_record_id;
    available:=current_value is not null;
  else
    select exists(select 1 from public.workout_instances w where w.workspace_id=n.workspace_id and w.id=n.target_id and w.client_record_id=n.client_record_id and w.finished_at is not null) into available;
  end if;
  return jsonb_build_object('available',available,'target_type',n.target_type,'target_id',n.target_id,'client_record_id',n.client_record_id,'current',current_value);
end; $$;
revoke all on function public.notification_feed(uuid,uuid,timestamptz,uuid,integer),public.mark_notification_read(uuid,uuid),public.notification_target(uuid,uuid) from public,anon,authenticated;
grant execute on function public.notification_feed(uuid,uuid,timestamptz,uuid,integer),public.mark_notification_read(uuid,uuid),public.notification_target(uuid,uuid) to authenticated;
alter publication supabase_realtime add table public.notifications;
commit;
