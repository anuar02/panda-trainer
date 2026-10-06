begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,aud,role,email) values
 ('58000000-0000-4000-8000-000000000001','authenticated','authenticated','resolution-owner@example.test'),
 ('58000000-0000-4000-8000-000000000002','authenticated','authenticated','resolution-client@example.test'),
 ('58000000-0000-4000-8000-000000000003','authenticated','authenticated','resolution-peer@example.test'),
 ('58000000-0000-4000-8000-000000000004','authenticated','authenticated','resolution-other@example.test');
insert into public.trainer_workspaces(id,owner_user_id,name) values
 ('68000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000001','Resolution A'),
 ('68000000-0000-4000-8000-000000000002','58000000-0000-4000-8000-000000000004','Resolution B');
insert into public.client_records(id,workspace_id,user_id,display_name) values
 ('78000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000002','Own'),
 ('78000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000003','Peer');
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at) values
 ('88000000-0000-4000-8000-000000000001','68000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001',now()+interval '30 days',now()+interval '30 days 1 hour'),
 ('88000000-0000-4000-8000-000000000002','68000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000002',now()+interval '31 days',now()+interval '31 days 1 hour');
select set_config('test.booking','88000000-0000-4000-8000-000000000001',true);
select set_config('test.request','98000000-0000-4000-8000-000000000001',true);
select set_config('test.target',((current_date+40)::timestamp at time zone 'Asia/Almaty'+interval '10 hours')::text,true);
select ok(not has_function_privilege('anon','public.resolve_booking_status_request(text,uuid,integer,uuid)','execute'),'anonymous status resolution denied');
select ok(not has_function_privilege('anon','public.resolve_booking_reschedule_request(text,uuid,uuid,integer,integer,timestamptz,uuid)','execute'),'anonymous reschedule resolution denied');
select ok(not has_table_privilege('authenticated','private.booking_command_abandonments','select'),'tombstones private');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.resolved',public.resolve_booking_status_request('cancel',current_setting('test.booking')::uuid,99,current_setting('test.request')::uuid)::text,true);
select is(current_setting('test.resolved')::jsonb->>'outcome','abandoned','future expected revision can be abandoned');
select is((current_setting('test.resolved')::jsonb->>'booking_id'),current_setting('test.booking'),'resolution binds actual booking');
select is(current_setting('test.resolved')::jsonb->>'workspace_id','68000000-0000-4000-8000-000000000001','resolution binds workspace');
select is(current_setting('test.resolved')::jsonb->>'request_id',current_setting('test.request'),'resolution binds exact request');
select ok(not (current_setting('test.resolved')::jsonb ? 'actor_user_id'),'resolution does not expose auth UUID');
select is(public.resolve_booking_status_request('cancel',current_setting('test.booking')::uuid,99,current_setting('test.request')::uuid),current_setting('test.resolved')::jsonb,'resolution repeats exact abandonment');
select throws_ok($$select public.cancel_booking(current_setting('test.booking')::uuid,99,current_setting('test.request')::uuid)$$,'55000','Request was abandoned','late command refused before revision test');
select throws_ok($$select public.resolve_booking_status_request('cancel',current_setting('test.booking')::uuid,1,current_setting('test.request')::uuid)$$,'22023','Request payload mismatch','changed payload cannot reuse tombstone');
select is((select revision from public.bookings where id=current_setting('test.booking')::uuid),1,'abandonment never mutates booking');
select throws_ok($$select public.resolve_booking_status_request('confirm',current_setting('test.booking')::uuid,1,gen_random_uuid())$$,'42501',null,'owner cannot resolve client-only confirm');
select set_config('test.proposed',public.propose_booking_reschedule(current_setting('test.booking')::uuid,1,current_setting('test.target')::timestamptz,current_setting('test.request')::uuid)::text,true);
select is(current_setting('test.proposed')::jsonb->>'proposal_status','pending','same request UUID isolated across families');
select set_config('test.pid',current_setting('test.proposed')::jsonb->>'proposal_id',true);
select set_config('test.success',public.resolve_booking_reschedule_request('propose',current_setting('test.booking')::uuid,null,1,null,current_setting('test.target')::timestamptz,current_setting('test.request')::uuid)::text,true);
select is(current_setting('test.success')::jsonb->>'outcome','succeeded','successful original returned rather than abandoned');
select is(current_setting('test.success')::jsonb->'result',current_setting('test.proposed')::jsonb||jsonb_build_object('replayed',true),'exact original success receipt retained');
select throws_ok($$select public.resolve_booking_reschedule_request('propose',current_setting('test.booking')::uuid,null,1,null,current_setting('test.target')::timestamptz+interval '1 day',current_setting('test.request')::uuid)$$,'22023','Request payload mismatch','changed success payload rejected');
select throws_ok($$select public.resolve_booking_reschedule_request('accept',null,current_setting('test.pid')::uuid,1,1,null,gen_random_uuid())$$,'42501','Wrong responding role','author cannot abandon an unauthorized reply');
select set_config('test.delayed','98000000-0000-4000-8000-000000000002',true);
select set_config('test.abandoned',public.resolve_booking_reschedule_request('propose',current_setting('test.booking')::uuid,null,1,null,current_setting('test.target')::timestamptz+interval '1 day',current_setting('test.delayed')::uuid)::text,true);
select is(current_setting('test.abandoned')::jsonb->>'outcome','abandoned','pending occupied slot can be resolved');
select set_config('test.withdraw',public.withdraw_booking_reschedule(current_setting('test.pid')::uuid,1,1,gen_random_uuid())::text,true);
select is((select revision from public.bookings where id=current_setting('test.booking')::uuid),1,'withdrawal preserves booking revision');
select throws_ok($$select public.propose_booking_reschedule(current_setting('test.booking')::uuid,1,current_setting('test.target')::timestamptz+interval '1 day',current_setting('test.delayed')::uuid)$$,'55000','Request was abandoned','late original cannot succeed after slot frees');
select throws_ok($$select public.resolve_booking_reschedule_request('counter',current_setting('test.booking')::uuid,current_setting('test.pid')::uuid,1,1,current_setting('test.target')::timestamptz,gen_random_uuid())$$,'22023',null,'reply booking cannot be forged by supplying both IDs');
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('test.confirm',public.confirm_booking(current_setting('test.booking')::uuid,1,current_setting('test.request')::uuid)::text,true);
select is(current_setting('test.confirm')::jsonb->>'status','confirmed','same status request UUID isolated across actors');
select is(public.resolve_booking_status_request('confirm',current_setting('test.booking')::uuid,1,current_setting('test.request')::uuid)->'result',current_setting('test.confirm')::jsonb||jsonb_build_object('replayed',true),'confirm success replay ignores changed current revision');
select is(public.resolve_booking_reschedule_request('accept',null,current_setting('test.pid')::uuid,999,999,null,gen_random_uuid())->>'outcome','abandoned','authorized reply can resolve stale revisions and closed proposal');
select throws_ok($$select public.resolve_booking_reschedule_request('withdraw',null,current_setting('test.pid')::uuid,2,2,null,gen_random_uuid())$$,'42501','Wrong responding role','non-author cannot resolve withdraw');
select throws_ok($$select public.resolve_booking_status_request('cancel','88000000-0000-4000-8000-000000000002',1,gen_random_uuid())$$,'P0002','Booking unavailable','peer booking not resolvable');
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.changing',public.propose_booking_reschedule(current_setting('test.booking')::uuid,2,current_setting('test.target')::timestamptz+interval '2 days',gen_random_uuid())::text,true);
select set_config('test.changingpid',current_setting('test.changing')::jsonb->>'proposal_id',true);
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('test.role_request',gen_random_uuid()::text,true);
select set_config('test.role_resolution',public.resolve_booking_reschedule_request('accept',null,current_setting('test.changingpid')::uuid,2,1,null,current_setting('test.role_request')::uuid)::text,true);
select set_config('test.counter',public.counter_booking_reschedule(current_setting('test.changingpid')::uuid,1,2,current_setting('test.target')::timestamptz+interval '3 days',gen_random_uuid())::text,true);
select is(current_setting('test.counter')::jsonb->>'proposal_revision','2','counter changes current proposal author and revision');
select is(public.resolve_booking_reschedule_request('accept',null,current_setting('test.changingpid')::uuid,2,1,null,current_setting('test.role_request')::uuid),current_setting('test.role_resolution')::jsonb,'lost resolution response replays tombstone after responding role changes');
select throws_ok($$select public.accept_booking_reschedule(current_setting('test.changingpid')::uuid,1,2,current_setting('test.role_request')::uuid)$$,'55000','Request was abandoned','late original stays abandoned after role transition');
select is((select revision from public.bookings where id=current_setting('test.booking')::uuid),2,'abandoned acceptance cannot move booking after counter');
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.resolve_booking_status_request('cancel',current_setting('test.booking')::uuid,1,gen_random_uuid())$$,'P0002','Booking unavailable','foreign owner denied');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.resolve_booking_status_request('cancel',current_setting('test.booking')::uuid,1,gen_random_uuid())$$,'42501','Authentication required','missing auth denied');
reset role;
select ok(not exists(select 1 from private.booking_command_abandonments a join private.booking_status_command_receipts r using(workspace_id,actor_user_id,request_id) where a.command_family='status'),'no status success and abandonment coexist');
select ok(not exists(select 1 from private.booking_command_abandonments a join private.booking_reschedule_receipts r using(workspace_id,actor_user_id,request_id) where a.command_family='reschedule'),'no reschedule success and abandonment coexist');
select set_config('request.jwt.claims','{"sub":"58000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.client_records set user_id=null where id='78000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.resolve_booking_status_request('confirm',current_setting('test.booking')::uuid,1,current_setting('test.request')::uuid)$$,'P0002','Booking unavailable','revoked link cannot read resolution receipt');
select * from finish();
rollback;
