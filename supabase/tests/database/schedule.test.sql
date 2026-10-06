begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(45);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('52000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'schedule-trainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'schedule-trainer-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'schedule-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'schedule-client-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('52000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'schedule-client-c@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.trainer_workspaces (id, owner_user_id, name, timezone)
values
  ('62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Schedule Workspace A', 'Asia/Almaty'),
  ('62000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000002', 'Schedule Workspace B', 'Asia/Almaty');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('72000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003', 'Schedule Client A'),
  ('72000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000004', 'Schedule Client B'),
  ('72000000-0000-4000-8000-000000000003', '62000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000005', 'Schedule Client C');

select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in (
    'public.group_sessions'::regclass,
    'public.bookings'::regclass,
    'public.schedule_proposals'::regclass
  )),
  'all schedule tables enable RLS'
);
select ok(not has_table_privilege('authenticated', 'public.group_sessions', 'INSERT'), 'group sessions cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.group_sessions', 'UPDATE'), 'group sessions cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.group_sessions', 'DELETE'), 'group sessions cannot be deleted directly');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'INSERT'), 'bookings cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'UPDATE'), 'bookings cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'DELETE'), 'bookings cannot be deleted directly');
select ok(not has_table_privilege('authenticated', 'public.schedule_proposals', 'INSERT'), 'proposals cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.schedule_proposals', 'UPDATE'), 'proposals cannot be updated directly');
select ok(not has_table_privilege('authenticated', 'public.schedule_proposals', 'DELETE'), 'proposals cannot be deleted directly');
select ok(not has_column_privilege('authenticated', 'public.bookings', 'request_id', 'SELECT'), 'clients cannot read idempotency request ids');
select ok(not has_column_privilege('authenticated', 'public.bookings', 'request_payload', 'SELECT'), 'clients cannot read request payloads containing peer ids');
select ok(has_function_privilege('authenticated', 'public.create_booking_set(uuid[],timestamptz,timestamptz,boolean,uuid)', 'EXECUTE'), 'authenticated users can execute the booking RPC');
select ok(not has_function_privilege('anon', 'public.create_booking_set(uuid[],timestamptz,timestamptz,boolean,uuid)', 'EXECUTE'), 'anonymous users cannot execute the booking RPC');

set local time zone 'UTC';
select set_config('test.schedule_start', (((now() at time zone 'Asia/Almaty')::date + 3)::timestamp + interval '9 hours') at time zone 'Asia/Almaty' || '', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid, '72000000-0000-4000-8000-000000000002'::uuid],
    current_setting('test.schedule_start')::timestamptz, current_setting('test.schedule_start')::timestamptz + interval '90 minutes', false,
    '82000000-0000-4000-8000-000000000001'
  )->>'created'),
  'true', 'trainer creates a proposed two-client booking set'
);
select is((select count(*)::integer from public.group_sessions), 1, 'trainer sees one group session');
select is((select count(*)::integer from public.bookings), 2, 'trainer sees both group bookings');
select is((select count(*)::integer from public.bookings where status = 'proposed'), 2, 'new bookings await client agreement');

set local time zone 'Asia/Almaty';
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid, '72000000-0000-4000-8000-000000000002'::uuid],
    current_setting('test.schedule_start')::timestamptz, current_setting('test.schedule_start')::timestamptz + interval '90 minutes', false,
    '82000000-0000-4000-8000-000000000001'
  )->>'replayed'),
  'true', 'equivalent instant retry replays after session timezone changes'
);

update public.client_records set archived_at = now()
where id = '72000000-0000-4000-8000-000000000001';
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid, '72000000-0000-4000-8000-000000000002'::uuid],
    current_setting('test.schedule_start')::timestamptz, current_setting('test.schedule_start')::timestamptz + interval '90 minutes', false,
    '82000000-0000-4000-8000-000000000001'
  )->>'replayed'),
  'true', 'idempotent retry returns original IDs after a client is archived'
);
update public.client_records set archived_at = null
where id = '72000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.bookings), 2, 'retries do not create duplicate bookings');

select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid],
    current_setting('test.schedule_start')::timestamptz + interval '30 minutes', current_setting('test.schedule_start')::timestamptz + interval '60 minutes', false,
    '82000000-0000-4000-8000-000000000002'
  )->>'created'),
  'false', 'overlap is returned for trainer acknowledgement'
);
select is(
  jsonb_array_length(public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid],
    current_setting('test.schedule_start')::timestamptz + interval '30 minutes', current_setting('test.schedule_start')::timestamptz + interval '60 minutes', false,
    '82000000-0000-4000-8000-000000000003'
  )->'overlaps'),
  1, 'a group overlap is collapsed to one schedule event'
);
select is((select count(*)::integer from public.bookings), 2, 'unacknowledged overlap writes no booking');
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid],
    current_setting('test.schedule_start')::timestamptz + interval '30 minutes', current_setting('test.schedule_start')::timestamptz + interval '60 minutes', true,
    '82000000-0000-4000-8000-000000000002'
  )->>'created'),
  'true', 'explicit acknowledgement permits the overlap'
);
select is(
  jsonb_array_length(public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid],
    current_setting('test.schedule_start')::timestamptz + interval '30 minutes', current_setting('test.schedule_start')::timestamptz + interval '60 minutes', true,
    '82000000-0000-4000-8000-000000000002'
  )->'overlaps'),
  0, 'successful idempotent replay returns no new collision warning'
);
select is((select count(*)::integer from public.bookings), 3, 'acknowledged overlap creates one personal booking');

reset role;
insert into public.schedule_proposals (workspace_id, booking_id, author_user_id, proposed_starts_at, proposed_ends_at, base_revision)
select b.workspace_id, b.id, '52000000-0000-4000-8000-000000000001', b.starts_at + interval '1 day', b.ends_at + interval '1 day', b.revision
from public.bookings b
where b.workspace_id = '62000000-0000-4000-8000-000000000001'
  and b.group_session_id is not null;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.bookings), 2, 'client sees only their own bookings');
select ok(not exists (
  select 1 from public.bookings
  where client_record_id = '72000000-0000-4000-8000-000000000002'
), 'group client cannot read the peer booking');
select is((select count(*)::integer from public.group_sessions), 1, 'client sees minimal shared group timing');
select is((select count(*)::integer from public.schedule_proposals), 1, 'client sees only proposals for their own bookings');

select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.bookings), 3, 'trainer sees every booking in their workspace');
select throws_ok(
  $$select public.create_booking_set(array['72000000-0000-4000-8000-000000000003'::uuid], current_setting('test.schedule_start')::timestamptz + interval '2 days', current_setting('test.schedule_start')::timestamptz + interval '2 days 30 minutes', false, '82000000-0000-4000-8000-000000000004')$$,
  '42501', 'client records unavailable', 'trainer cannot book a client from another workspace'
);
select throws_ok(
  $$select public.create_booking_set(array['72000000-0000-4000-8000-000000000002'::uuid], ((date_trunc('day', now() at time zone 'Asia/Almaty') + interval '2 days 23 hours 30 minutes') at time zone 'Asia/Almaty'), ((date_trunc('day', now() at time zone 'Asia/Almaty') + interval '3 days 1 minute') at time zone 'Asia/Almaty'), false, '82000000-0000-4000-8000-000000000005')$$,
  '22023', 'invalid booking interval', 'booking cannot extend beyond next local midnight'
);
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000002'::uuid],
    ((date_trunc('day', now() at time zone 'Asia/Almaty') + interval '2 days 23 hours') at time zone 'Asia/Almaty'),
    ((date_trunc('day', now() at time zone 'Asia/Almaty') + interval '3 days') at time zone 'Asia/Almaty'),
    false, '82000000-0000-4000-8000-000000000006'
  )->>'created'),
  'true', 'booking may end exactly at local midnight'
);
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000002'::uuid],
    current_setting('test.schedule_start')::timestamptz + interval '90 minutes', current_setting('test.schedule_start')::timestamptz + interval '120 minutes', false,
    '82000000-0000-4000-8000-000000000007'
  )->>'created'),
  'true', 'touching half-open intervals do not overlap'
);

reset role;
update public.bookings set status = 'cancelled_by_client'
where workspace_id = '62000000-0000-4000-8000-000000000001'
  and starts_at = current_setting('test.schedule_start')::timestamptz;
update public.bookings set status = 'cancelled_by_trainer'
where workspace_id = '62000000-0000-4000-8000-000000000001'
  and request_id = '82000000-0000-4000-8000-000000000002';
select is(
  (public.create_booking_set(
    array['72000000-0000-4000-8000-000000000001'::uuid],
    current_setting('test.schedule_start')::timestamptz + interval '30 minutes', current_setting('test.schedule_start')::timestamptz + interval '60 minutes', false,
    '82000000-0000-4000-8000-000000000008'
  )->>'created'),
  'true', 'cancelled booking events no longer produce overlap warnings'
);

update public.bookings set status = 'confirmed'
where request_id = '82000000-0000-4000-8000-000000000001';
select is((select revision::integer from public.bookings where request_id = '82000000-0000-4000-8000-000000000001'), 3, 'booking updates increment revision');
with changed as (
  update public.schedule_proposals set status = 'accepted'
  where id = (select id from public.schedule_proposals order by id limit 1)
  returning revision
)
select is((select max(revision) from changed), 2, 'proposal updates increment revision');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$select public.create_booking_set(array['72000000-0000-4000-8000-000000000001'::uuid], current_setting('test.schedule_start')::timestamptz, current_setting('test.schedule_start')::timestamptz + interval '90 minutes', false, '82000000-0000-4000-8000-000000000001')$$,
  '22023', 'request id payload mismatch', 'a successful request ID cannot be reused with different participants'
);
select throws_ok(
  $$select public.create_booking_set(array['72000000-0000-4000-8000-000000000001'::uuid, '72000000-0000-4000-8000-000000000001'::uuid], current_setting('test.schedule_start')::timestamptz, current_setting('test.schedule_start')::timestamptz + interval '90 minutes', false, gen_random_uuid())$$,
  '22023', 'duplicate client record', 'a participant cannot occur twice in a booking set'
);
select throws_ok(
  $$select public.create_booking_set(array['72000000-0000-4000-8000-000000000001'::uuid], now() - interval '1 hour', now(), false, gen_random_uuid())$$,
  '22023', 'invalid booking interval', 'new bookings cannot start in the past'
);
select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select request_payload from public.bookings$$,
  '42501', null, 'client cannot retrieve peer IDs through a group receipt'
);
select throws_ok(
  $$select public.create_booking_set(array['72000000-0000-4000-8000-000000000001'::uuid], current_setting('test.schedule_start')::timestamptz, current_setting('test.schedule_start')::timestamptz + interval '90 minutes', true, gen_random_uuid())$$,
  '42501', 'trainer workspace required', 'client cannot acknowledge overlap or create a booking'
);
select set_config('request.jwt.claims', '{"sub":"52000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.bookings where workspace_id = '62000000-0000-4000-8000-000000000001'), 0, 'trainer B cannot read trainer A bookings using a known workspace ID');
reset role;

select * from finish();
rollback;
