begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('53000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'status-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'status-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'status-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'status-client-peer@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'status-client-foreign@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('63000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Status workspace A'),
  ('63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'Status workspace B');
insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('73000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000003', 'Status client A'),
  ('73000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000004', 'Status client peer'),
  ('73000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000005', 'Status foreign client');
insert into public.group_sessions (id, workspace_id, starts_at, ends_at)
values ('83000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour');
insert into public.bookings (id, workspace_id, client_record_id, group_session_id, starts_at, ends_at, status)
values
  ('93000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'proposed'),
  ('93000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000002', '83000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour', 'proposed'),
  ('93000000-0000-4000-8000-000000000003', '63000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', null, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed'),
  ('93000000-0000-4000-8000-000000000004', '63000000-0000-4000-8000-000000000001', '73000000-0000-4000-8000-000000000001', null, now() + interval '3 days', now() + interval '3 days 1 hour', 'confirmed'),
  ('93000000-0000-4000-8000-000000000005', '63000000-0000-4000-8000-000000000002', '73000000-0000-4000-8000-000000000003', null, now() + interval '2 days', now() + interval '2 days 1 hour', 'confirmed');
insert into public.workout_instances (id, workspace_id, booking_id, client_record_id, finished_at)
values ('a3000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000004', '73000000-0000-4000-8000-000000000001', now());
insert into public.schedule_proposals (id, workspace_id, booking_id, author_user_id, proposed_starts_at, proposed_ends_at, base_revision)
values ('a4000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000001', now() + interval '4 days', now() + interval '4 days 1 hour', 1);

select ok((select relrowsecurity from pg_class where oid = 'private.booking_status_command_receipts'::regclass), 'command receipts enable RLS');
select ok(not has_table_privilege('authenticated', 'private.booking_status_command_receipts', 'SELECT'), 'clients cannot read command receipts');
select ok(not has_function_privilege('anon', 'public.confirm_booking(uuid,integer,uuid)', 'EXECUTE'), 'anonymous callers cannot confirm bookings');
select ok(not has_function_privilege('anon', 'public.cancel_booking(uuid,integer,uuid)', 'EXECUTE'), 'anonymous callers cannot cancel bookings');
select ok(has_function_privilege('authenticated', 'public.confirm_booking(uuid,integer,uuid)', 'EXECUTE'), 'authenticated callers can invoke confirmation RPC');
select ok(has_function_privilege('authenticated', 'public.cancel_booking(uuid,integer,uuid)', 'EXECUTE'), 'authenticated callers can invoke cancellation RPC');
select ok(not has_table_privilege('authenticated', 'public.bookings', 'UPDATE'), 'direct booking updates remain closed');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('test.confirm_result', public.confirm_booking('93000000-0000-4000-8000-000000000001', 1, 'b3000000-0000-4000-8000-000000000001')::text, true);
select is((current_setting('test.confirm_result')::jsonb->>'status'), 'confirmed', 'linked client confirms their proposed booking');
select is((current_setting('test.confirm_result')::jsonb->>'revision')::integer, 2, 'confirmation returns incremented booking revision');
select is((current_setting('test.confirm_result')::jsonb->>'replayed'), 'false', 'first confirmation reports not replayed');
select is((public.confirm_booking('93000000-0000-4000-8000-000000000001', 1, 'b3000000-0000-4000-8000-000000000001')->>'revision')::integer, 2, 'same-key retry returns original revision before checking stale expected revision');
select is((public.confirm_booking('93000000-0000-4000-8000-000000000001', 1, 'b3000000-0000-4000-8000-000000000001')->>'replayed'), 'true', 'same-key retry is marked replayed');
select throws_ok($$select public.confirm_booking('93000000-0000-4000-8000-000000000001', 2, 'b3000000-0000-4000-8000-000000000001')$$, '22023', null, 'same key with changed payload is rejected');
select throws_ok($$select public.confirm_booking('93000000-0000-4000-8000-000000000002', 1, 'b3000000-0000-4000-8000-000000000002')$$, 'P0002', 'Booking unavailable', 'client cannot confirm a group peer booking');
select throws_ok($$select public.confirm_booking('93000000-0000-4000-8000-000000000001', 1, 'b3000000-0000-4000-8000-000000000003')$$, '40001', 'Booking revision is stale', 'stale expected revision is rejected');
select is((select status from public.bookings where id = '93000000-0000-4000-8000-000000000001'), 'confirmed', 'stale command leaves confirmed state unchanged');
select throws_ok($$select public.confirm_booking('93000000-0000-4000-8000-000000000004', 1, 'b3000000-0000-4000-8000-000000000011')$$, '55000', 'A finished workout cannot change booking status', 'finished workout booking cannot be confirmed');
select throws_ok($$select payload from private.booking_status_command_receipts$$, '42501', null, 'authenticated users cannot query private receipts');

select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select set_config('test.peer_cancel_result', public.cancel_booking('93000000-0000-4000-8000-000000000002', 1, 'b3000000-0000-4000-8000-000000000004')::text, true);
select is((current_setting('test.peer_cancel_result')::jsonb->>'status'), 'cancelled_by_client', 'linked client cancels their own group booking');
reset role;
select is((select status from public.bookings where id = '93000000-0000-4000-8000-000000000001'), 'confirmed', 'canceling one group member leaves peer booking unchanged');
set local role authenticated;
select is((select status from public.schedule_proposals where id = 'a4000000-0000-4000-8000-000000000001'), 'withdrawn', 'client cancellation closes pending proposals as withdrawn');
select throws_ok($$select public.cancel_booking('93000000-0000-4000-8000-000000000001', 2, 'b3000000-0000-4000-8000-000000000005')$$, 'P0002', 'Booking unavailable', 'group peer cannot cancel another participant booking');

select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.confirm_booking('93000000-0000-4000-8000-000000000003', 1, 'b3000000-0000-4000-8000-000000000006')$$, '42501', null, 'trainer cannot confirm in place of a client');
select set_config('test.trainer_cancel_result', public.cancel_booking('93000000-0000-4000-8000-000000000003', 1, 'b3000000-0000-4000-8000-000000000001')::text, true);
select is((current_setting('test.trainer_cancel_result')::jsonb->>'status'), 'cancelled_by_trainer', 'trainer cancels a booking in their workspace');
select is((current_setting('test.trainer_cancel_result')::jsonb->>'replayed'), 'false', 'same request id can be used independently by another actor');
select throws_ok($$select public.cancel_booking('93000000-0000-4000-8000-000000000004', 1, 'b3000000-0000-4000-8000-000000000007')$$, '55000', 'A finished workout cannot change booking status', 'finished workout booking cannot be cancelled');
select is((select status from public.bookings where id = '93000000-0000-4000-8000-000000000004'), 'confirmed', 'finished booking remains unchanged after rejected cancellation');
select throws_ok($$select public.cancel_booking('93000000-0000-4000-8000-000000000005', 1, 'b3000000-0000-4000-8000-000000000008')$$, 'P0002', 'Booking unavailable', 'trainer cannot cancel a known foreign-workspace booking');

select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000005","role":"authenticated"}', true);
select throws_ok($$select public.cancel_booking('93000000-0000-4000-8000-000000000001', 2, 'b3000000-0000-4000-8000-000000000009')$$, 'P0002', 'Booking unavailable', 'foreign client cannot cancel booking using known ID');
select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.cancel_booking('93000000-0000-4000-8000-000000000001', 2, gen_random_uuid())$$, 'trainer can cancel a previously confirmed booking');
select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((public.confirm_booking('93000000-0000-4000-8000-000000000001', 1, 'b3000000-0000-4000-8000-000000000001')->>'status'), 'confirmed', 'confirmation retry preserves original response after later cancellation');
select is((select status from public.bookings where id = '93000000-0000-4000-8000-000000000001'), 'cancelled_by_trainer', 'replaying confirmation does not revert cancellation');
select set_config('request.jwt.claims', '{}', true);
select throws_ok($$select public.cancel_booking('93000000-0000-4000-8000-000000000001', 2, 'b3000000-0000-4000-8000-000000000010')$$, '42501', null, 'anonymous identity cannot invoke cancellation');
reset role;
select * from finish();
rollback;
