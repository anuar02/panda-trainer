"""Synthetic concurrent replay: DATABASE_URL=... python3 supabase/tests/workout_sync_concurrency.py.

Requires psql and a disposable database with all migrations applied. Creates synthetic
fixtures, races two independent PostgreSQL sessions, then removes its own fixtures.
"""
import concurrent.futures
import json
import os
import subprocess
import uuid
import threading


def sql(statement):
    process = subprocess.run(['psql', os.environ['DATABASE_URL'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, capture_output=True)
    if process.returncode:
        raise RuntimeError('PostgreSQL fixture or assertion failed: ' + process.stderr)
    return process.stdout.strip()


def main():
    owner, workspace, client, booking, workout, device, operation = [str(uuid.uuid4()) for _ in range(7)]
    envelope = dict(operation_id=operation, kind='create_workout', entity_id=workout, base_revision=0, device_id=device, payload=dict(booking_id=booking), created_at='2026-10-03T12:00:00Z')
    encoded = json.dumps(envelope, separators=(',', ':'))
    try:
        sql(f"""begin;
insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','concurrency-{owner}@example.test');
insert into public.profiles(user_id,display_name) values('{owner}','Synthetic concurrency owner');
insert into public.trainer_workspaces(id,owner_user_id,name) values('{workspace}','{owner}','Synthetic concurrency fixture');
insert into public.client_records(id,workspace_id,display_name) values('{client}','{workspace}','Synthetic client');
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values('{booking}','{workspace}','{client}',now()+interval '100 days',now()+interval '100 days 1 hour','confirmed');
commit;""")
        barrier = threading.Barrier(2)
        def replay(_):
            barrier.wait(timeout=10)
            return json.loads(sql(f"""begin;
set local role authenticated;
set local request.jwt.claim.sub='{owner}';
select public.apply_operations('{workspace}','[{encoded}]'::jsonb);
select pg_sleep(1);
commit;"""))
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(executor.map(replay, range(2)))
        assert responses[0] == responses[1], responses
        assert responses[0]['results'][0]['status'] == 'applied', responses
        counts = sql(f"select (select count(*) from public.workout_instances where id='{workout}')::text || '|' || (select count(*) from public.sync_operations where operation_id='{operation}')::text;")
        assert counts == '1|1', counts
        def apply(envelope):
            encoded = json.dumps([envelope], separators=(',', ':')).replace("'", "''")
            return json.loads(sql(f"""begin;
set local role authenticated;
set local request.jwt.claim.sub='{owner}';
select public.apply_operations('{workspace}','{encoded}'::jsonb);
commit;"""))['results'][0]

        def operation_for(kind, entity, revision, payload, source=device):
            return dict(operation_id=str(uuid.uuid4()), kind=kind, entity_id=entity,
                        base_revision=revision, device_id=source, payload=payload,
                        created_at='2026-10-03T12:00:00Z')

        exercise = sql(f"select id from public.exercises where workspace_id='{workspace}' and source_key='e0';")
        workout_exercise, set_id, second_device = [str(uuid.uuid4()) for _ in range(3)]
        assert apply(operation_for('add_exercise', workout_exercise, 0,
                     dict(workout_instance_id=workout, exercise_id=exercise, position=0, planned_sets=3)))['status'] == 'applied'
        payload = dict(workout_instance_id=workout, workout_exercise_id=workout_exercise,
                       position=0, reps=8, seconds=None, weight_g=40000)
        assert apply(operation_for('upsert_set', set_id, 0, payload))['status'] == 'applied'
        conflict = apply(operation_for('upsert_set', set_id, 0, dict(payload, reps=12), second_device))
        assert conflict['status'] == 'conflict', conflict
        barrier = threading.Barrier(2)
        choices = [operation_for('resolve_conflict', set_id, conflict['revision'],
                   dict(conflict_id=conflict['conflict_id'], selected_version=choice,
                        expected_revision=conflict['revision']), source)
                   for choice, source in [('current', device), ('incoming', second_device)]]
        def resolve(envelope):
            barrier.wait(timeout=10)
            return apply(envelope)
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            resolutions = list(executor.map(resolve, choices))
        assert sorted(result['status'] for result in resolutions) == ['applied', 'error'], resolutions
        loser = next(result for result in resolutions if result['status'] == 'error')
        assert loser['error_code'] == 'stale_conflict', resolutions
        assert [apply(envelope) for envelope in choices] == resolutions, 'Resolution receipts must replay both winner and loser'
        winner = next(index for index, result in enumerate(resolutions) if result['status'] == 'applied')
        expected_reps = '8' if winner == 0 else '12'
        assert sql(f"select reps::text || '|' || revision::text from public.set_results where id='{set_id}';") == expected_reps + '|2'
        assert sql(f"select count(*) from public.workout_sync_conflicts where id='{conflict['conflict_id']}' and resolved_at is not null;") == '1'
        print('PASS: independent concurrent sessions replay one receipt; two devices resolve once and reject the stale choice.')

    finally:
        sql(f"""begin;
delete from public.sync_operations where workspace_id='{workspace}';
delete from public.workout_sync_conflicts where workspace_id='{workspace}';
delete from public.workout_correction_drafts where workspace_id='{workspace}';
delete from public.set_results where workspace_id='{workspace}';
delete from public.session_notes where workspace_id='{workspace}';
delete from public.private_notes where workspace_id='{workspace}';
update public.workout_exercises set replaced_from_id=null where workspace_id='{workspace}';
delete from public.workout_exercises where workspace_id='{workspace}';
delete from public.workout_instances where workspace_id='{workspace}';
delete from public.bookings where workspace_id='{workspace}';
delete from public.client_records where workspace_id='{workspace}';
delete from public.exercises where workspace_id='{workspace}';
delete from public.trainer_workspaces where id='{workspace}';
delete from public.profiles where user_id='{owner}';
delete from auth.users where id='{owner}';
commit;""")


if __name__ == '__main__':
    main()
