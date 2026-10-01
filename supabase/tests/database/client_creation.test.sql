begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(26);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('53000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'client-create-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'client-create-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('53000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'client-create-no-workspace@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.profiles (user_id, display_name)
values
  ('53000000-0000-4000-8000-000000000001', 'Client creation trainer A'),
  ('53000000-0000-4000-8000-000000000002', 'Client creation trainer B');
insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('63000000-0000-4000-8000-000000000001', '53000000-0000-4000-8000-000000000001', 'Client creation workspace A'),
  ('63000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002', 'Client creation workspace B');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.initial_result', public.create_client_record('  Initial client  ', '  555-0101  ', '73000000-0000-4000-8000-000000000001')::text, true);
select is((current_setting('test.initial_result')::jsonb->>'replayed'), 'false', 'first call reports a new client');
select is((current_setting('test.initial_result')::jsonb->>'display_name'), 'Initial client', 'client name is trimmed');
select is((current_setting('test.initial_result')::jsonb->>'phone'), '555-0101', 'client phone is trimmed');
select ok(
  current_setting('test.initial_result')::jsonb->>'user_id' is null
  and current_setting('test.initial_result')::jsonb->>'created_by' = auth.uid()::text,
  'new client is unlinked and audit identity comes from auth.uid'
);
select set_config('test.owner_client_id', current_setting('test.initial_result')::jsonb->>'id', true);
select ok(not has_column_privilege('authenticated', 'public.client_records', 'user_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.client_records', 'created_by', 'INSERT'),
  'trainer cannot directly assign client linkage or audit identity');
select throws_ok(
  $$insert into public.client_records (workspace_id, display_name, user_id, created_by)
    values ('63000000-0000-4000-8000-000000000001', 'Spoofed client', '53000000-0000-4000-8000-000000000002', '53000000-0000-4000-8000-000000000002')$$,
  '42501', null,
  'direct insert cannot spoof the linked user or creator'
);
select throws_ok($$select payload from private.client_creation_receipts$$, '42501', null, 'private creation receipts cannot be read directly');

update public.client_records
set display_name = 'Renamed after creation', archived_at = now()
where id = current_setting('test.owner_client_id')::uuid;
select set_config('test.retry_result', public.create_client_record('Initial client', '555-0101', '73000000-0000-4000-8000-000000000001')::text, true);
select is((current_setting('test.retry_result')::jsonb->>'replayed'), 'true', 'same request replays');
select ok(
  current_setting('test.retry_result')::jsonb->>'id' = current_setting('test.owner_client_id')
  and current_setting('test.retry_result')::jsonb->>'display_name' = 'Initial client'
  and current_setting('test.retry_result')::jsonb->>'archived_at' is null,
  'retry returns the original immutable client snapshot after later rename and archive'
);
select ok(exists (select 1 from public.client_records where id = current_setting('test.owner_client_id')::uuid and display_name = 'Renamed after creation' and archived_at is not null), 'retry does not undo later client changes');
select throws_ok($$select public.create_client_record('Different payload', '555-0101', '73000000-0000-4000-8000-000000000001')$$, '22023', null, 'request id reuse with changed payload is rejected');

select set_config('test.second_result', public.create_client_record('Second client', '   ', '73000000-0000-4000-8000-000000000002')::text, true);
select ok(current_setting('test.second_result')::jsonb->>'id' <> current_setting('test.owner_client_id'), 'a new request creates a distinct client');
select is((current_setting('test.second_result')::jsonb->>'phone'), null::text, 'blank optional phone is stored as null');
select is((select count(*)::integer from public.client_records where workspace_id = '63000000-0000-4000-8000-000000000001'), 2, 'only the two requested clients were created for trainer A');

select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.client_records), 0, 'trainer B cannot see trainer A clients');
select set_config('test.other_result', public.create_client_record('Trainer B client', null, '73000000-0000-4000-8000-000000000001')::text, true);
select is((current_setting('test.other_result')::jsonb->>'workspace_id'), '63000000-0000-4000-8000-000000000002', 'RPC derives trainer B workspace from auth.uid');
select ok(current_setting('test.other_result')::jsonb->>'id' <> current_setting('test.owner_client_id'), 'same request id is scoped to the other actor and workspace');
select ok(not exists (select 1 from public.client_records where id = current_setting('test.owner_client_id')::uuid), 'trainer B cannot read a known trainer A client id');

select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.create_client_record('No workspace client', null, gen_random_uuid())$$, '42501', null, 'authenticated user without a workspace is denied');

select set_config('request.jwt.claims', '{"sub":"53000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.create_client_record(null, null, gen_random_uuid())$$, '22023', null, 'null client name is rejected');
select throws_ok($$select public.create_client_record('   ', null, gen_random_uuid())$$, '22023', null, 'blank client name is rejected');
select throws_ok($$select public.create_client_record(repeat('x', 121), null, gen_random_uuid())$$, '22023', null, 'client name over 120 characters is rejected');
select throws_ok($$select public.create_client_record('Invalid phone', repeat('1', 81), gen_random_uuid())$$, '22023', null, 'phone over 80 characters is rejected');
select throws_ok($$select public.create_client_record('Missing request', null, null)$$, '22023', null, 'null request id is rejected');
select is((select count(*)::integer from public.client_records where workspace_id = '63000000-0000-4000-8000-000000000001'), 2, 'invalid requests create no clients');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.create_client_record('Anonymous client', null, gen_random_uuid())$$, '42501', null, 'anonymous caller cannot create a client');

select * from finish();
rollback;
