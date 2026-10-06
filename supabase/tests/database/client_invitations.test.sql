begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(33);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'invite-trainer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'invite-trainer-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'invite-client-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('11000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'invite-client-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.trainer_workspaces (id, owner_user_id, name)
values
  ('21000000-0000-4000-8000-000000000001', '11000000-0000-4000-8000-000000000001', 'Trainer A'),
  ('21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000002', 'Trainer B');

insert into public.client_records (id, workspace_id, user_id, display_name)
values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', null, 'Existing history card'),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000001', null, 'Expired invitation card'),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', '11000000-0000-4000-8000-000000000003', 'Separate trainer card');

insert into public.bookings (id, workspace_id, client_record_id, starts_at, ends_at, status)
values (
  '41000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  now() - interval '2 days', now() - interval '2 days' + interval '1 hour', 'confirmed'
);
insert into public.workout_instances (id, workspace_id, booking_id, client_record_id, finished_at)
values (
  '42000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  now() - interval '2 days'
);

select ok(not has_column_privilege('authenticated', 'public.invitations', 'token_hash', 'SELECT'), 'invitation hashes remain hidden from trainers');
select ok(not has_column_privilege('authenticated', 'public.invitations', 'accepted_by', 'SELECT'), 'trainer cannot inspect the accepting account identity');
select ok(not has_table_privilege('authenticated', 'private.client_invitation_receipts', 'SELECT'), 'invitation idempotency receipts are private');
select ok(has_function_privilege('authenticated', 'public.issue_client_invitation(uuid,text,uuid)', 'EXECUTE'), 'signed-in trainers can issue invitations through the RPC');
select ok(not has_function_privilege('anon', 'public.issue_client_invitation(uuid,text,uuid)', 'EXECUTE'), 'anonymous callers cannot issue invitations');

do $$
begin
  perform set_config('test.invite_token_one', translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), E'\n='), '+/', '-_'), true);
  perform set_config('test.invite_token_two', translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), E'\n='), '+/', '-_'), true);
  perform set_config('test.invite_token_three', translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), E'\n='), '+/', '-_'), true);
  perform set_config('test.expired_token', translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), E'\n='), '+/', '-_'), true);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.issue_one', public.issue_client_invitation('31000000-0000-4000-8000-000000000001', current_setting('test.invite_token_one'), '51000000-0000-4000-8000-000000000001')::text, true);
select is((current_setting('test.issue_one')::jsonb->>'active'), 'true', 'new invitation is active');
select is((current_setting('test.issue_one')::jsonb->>'replayed'), 'false', 'first issue is not replayed');
select ok((current_setting('test.issue_one')::jsonb->>'expires_at')::timestamptz between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute', 'invitation expires seven days after issue');
reset role;
select ok(exists (
  select 1 from public.invitations i
  where i.id = (current_setting('test.issue_one')::jsonb->>'invitation_id')::uuid
    and i.token_hash = encode(extensions.digest(convert_to(current_setting('test.invite_token_one'), 'UTF8'), 'sha256'), 'hex')
), 'database stores the SHA-256 digest of the supplied token');
select ok(not exists (
  select 1 from private.client_invitation_receipts r
  where r.request_id = '51000000-0000-4000-8000-000000000001'
    and r.payload::text like '%' || current_setting('test.invite_token_one') || '%'
), 'idempotency receipt contains no raw token');
select ok(current_setting('test.issue_one') not like '%' || current_setting('test.invite_token_one') || '%', 'issue result contains no raw token');
set local role authenticated;
select set_config('test.issue_one_retry', public.issue_client_invitation('31000000-0000-4000-8000-000000000001', current_setting('test.invite_token_one'), '51000000-0000-4000-8000-000000000001')::text, true);
select is(current_setting('test.issue_one_retry')::jsonb->>'invitation_id', current_setting('test.issue_one')::jsonb->>'invitation_id', 'same request id and token return the original invitation');
select is(current_setting('test.issue_one_retry')::jsonb->>'replayed', 'true', 'same issue request is marked replayed');
select throws_ok($$select public.issue_client_invitation('31000000-0000-4000-8000-000000000001', repeat('x', 43), '51000000-0000-4000-8000-000000000001')$$, '22023', null, 'same request id cannot be reused with a different token');
select throws_ok($$select public.issue_client_invitation('31000000-0000-4000-8000-000000000001', 'too-short', gen_random_uuid())$$, '22023', null, 'token below the required size is rejected');

select set_config('test.issue_two', public.issue_client_invitation('31000000-0000-4000-8000-000000000001', current_setting('test.invite_token_two'), '51000000-0000-4000-8000-000000000002')::text, true);
select ok(exists (
  select 1 from public.invitations i
  where i.id = (current_setting('test.issue_one')::jsonb->>'invitation_id')::uuid
    and i.revoked_at is not null and i.accepted_at is null
), 'new invitation revokes the prior unused link');
select ok(not exists (
  select 1 from public.invitations i
  where i.id = (current_setting('test.issue_two')::jsonb->>'invitation_id')::uuid
    and i.revoked_at is not null
), 'replacement invitation stays active');

select set_config('test.revoke_one', public.revoke_client_invitation((current_setting('test.issue_two')::jsonb->>'invitation_id')::uuid, '51000000-0000-4000-8000-000000000003')::text, true);
select is(current_setting('test.revoke_one')::jsonb->>'revoked', 'true', 'owner can revoke an unused invitation');
select is((public.revoke_client_invitation((current_setting('test.issue_two')::jsonb->>'invitation_id')::uuid, '51000000-0000-4000-8000-000000000003')->>'replayed'), 'true', 'revoke retry is idempotent');
select throws_ok($$select public.accept_invitation(current_setting('test.invite_token_two'))$$, 'P0002', null, 'revoked invitation is unavailable');

select set_config('test.issue_three', public.issue_client_invitation('31000000-0000-4000-8000-000000000001', current_setting('test.invite_token_three'), '51000000-0000-4000-8000-000000000004')::text, true);
select throws_ok($$select public.issue_client_invitation('31000000-0000-4000-8000-000000000003', current_setting('test.invite_token_one'), gen_random_uuid())$$, 'P0002', null, 'trainer cannot issue an invitation for another trainer record');

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select set_config('test.accept_result', public.accept_invitation(current_setting('test.invite_token_three'))::text, true);
select is(current_setting('test.accept_result')::jsonb->>'accepted', 'true', 'any signed-in holder can accept the privately shared link');
select is(current_setting('test.accept_result')::jsonb->>'trainer_name', 'Trainer A', 'acceptance returns only the trainer workspace name');
select ok(current_setting('test.accept_result') not like '%' || current_setting('test.invite_token_three') || '%', 'accept result contains no raw token');
select is((select user_id::text from public.client_records where id = '31000000-0000-4000-8000-000000000001'), '11000000-0000-4000-8000-000000000003', 'acceptance links the existing card to the accepting account');
select ok(exists (select 1 from public.workout_instances where client_record_id = '31000000-0000-4000-8000-000000000001'), 'existing workout history remains attached to the linked card');
select is((select display_name from public.client_records where id = '31000000-0000-4000-8000-000000000001'), 'Existing history card', 'acceptance preserves the existing client card');
select is((select count(*)::integer from public.client_records), 2, 'one client account can see separate cards from multiple trainers');
select set_config('test.accept_retry', public.accept_invitation(current_setting('test.invite_token_three'))::text, true);
select is(current_setting('test.accept_retry')::jsonb->>'replayed', 'true', 'same account can retry its accepted invitation');
select throws_ok($$select public.accept_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, 'P0002', null, 'invalid token receives the same neutral unavailable error');

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.accept_invitation(current_setting('test.invite_token_three'))$$, 'P0002', null, 'another account cannot claim an already linked card');

select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select set_config('test.expired_result', public.issue_client_invitation('31000000-0000-4000-8000-000000000002', current_setting('test.expired_token'), '51000000-0000-4000-8000-000000000005')::text, true);
reset role;
update public.invitations
set expires_at = now() - interval '1 second'
where id = (current_setting('test.expired_result')::jsonb->>'invitation_id')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.accept_invitation(current_setting('test.expired_token'))$$, 'P0002', null, 'expired invitation is unavailable');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.accept_invitation('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')$$, '42501', null, 'anonymous callers cannot accept invitations');

select * from finish();
rollback;
