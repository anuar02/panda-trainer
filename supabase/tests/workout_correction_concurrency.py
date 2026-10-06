"""Synthetic independent PostgreSQL sessions; requires all migrations in a disposable DB.

DATABASE_URL=... python3 supabase/tests/workout_correction_concurrency.py
python3 supabase/tests/workout_correction_concurrency.py --container supabase_db_trainerApp
"""
import argparse
import concurrent.futures
import json
import os
import subprocess
import threading
import uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container')
    args = parser.parse_args()
    if args.container:
        executable = ['docker', 'exec', '-i', args.container, 'psql', '-U', 'postgres', '-d', 'postgres']
    elif os.environ.get('DATABASE_URL'):
        executable = ['psql', os.environ['DATABASE_URL']]
    else:
        parser.error('Set DATABASE_URL or pass --container')

    def sql(statement):
        process = subprocess.run(executable + ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=statement, text=True, capture_output=True)
        if process.returncode:
            raise RuntimeError(process.stderr)
        return process.stdout.strip()

    owner, workspace, client, booking, workout, device, exercise_id = [str(uuid.uuid4()) for _ in range(7)]

    def auth(statement):
        return sql(f"begin; set local role authenticated; set local request.jwt.claim.sub='{owner}'; {statement}; select pg_sleep(0.15); commit;")

    def operation(kind, entity, revision, payload):
        return dict(operation_id=str(uuid.uuid4()), kind=kind, entity_id=entity, base_revision=revision,
                    device_id=device, payload=payload, created_at='2026-10-04T12:00:00Z')

    def sync(op):
        encoded = json.dumps([op], separators=(',', ':')).replace("'", "''")
        return json.loads(auth(f"select public.apply_operations('{workspace}','{encoded}'::jsonb)"))['results'][0]

    def review(draft):
        return json.loads(auth(f"select public.get_workout_correction('{owner}','{workspace}','{workout}','{draft}')"))

    def command(draft, request=None):
        value = review(draft)
        return dict(draft=draft, request=request or str(uuid.uuid4()), workout=value['workout_revision'],
                    entity=value['entity_revision'], exercise=value['exercise_revision'])

    def correction_sql(value):
        exercise = 'null' if value['exercise'] is None else str(value['exercise'])
        return f"select public.apply_workout_correction('{owner}','{workspace}','{workout}','{value['draft']}','{value['request']}',{value['workout']},{value['entity']},{exercise})"

    def correct(value):
        try:
            return dict(ok=True, result=json.loads(auth(correction_sql(value))))
        except RuntimeError as error:
            return dict(ok=False, error=str(error))

    def race(first, second):
        barrier = threading.Barrier(2)
        def run(action):
            barrier.wait(timeout=20)
            return action()
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(run, action) for action in (first, second)]
            return [future.result(timeout=30) for future in futures]

    def new_note(text):
        result = sync(operation('set_note', str(uuid.uuid4()), 0,
                                dict(workout_instance_id=workout, text=text, shared=False)))
        assert result['status'] == 'correction_draft', result
        return result['draft_id']

    try:
        sql(f"""begin;
insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','correction-race-{owner}@example.test');
insert into public.profiles(user_id,display_name) values('{owner}','Synthetic correction race owner');
insert into public.trainer_workspaces(id,owner_user_id,name) values('{workspace}','{owner}','Synthetic correction race fixture');
insert into public.client_records(id,workspace_id,display_name) values('{client}','{workspace}','Synthetic correction client');
insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values('{booking}','{workspace}','{client}',now()+interval '130 days',now()+interval '130 days 1 hour','confirmed');
commit;""")
        assert sync(operation('create_workout', workout, 0, dict(booking_id=booking)))['status'] == 'applied'
        library = sql(f"select id from public.exercises where workspace_id='{workspace}' and source_key='e0'")
        assert sync(operation('add_exercise', exercise_id, 0, dict(workout_instance_id=workout, exercise_id=library, position=0, planned_sets=3)))['status'] == 'applied'
        assert sync(operation('finish_workout', workout, 1, {}))['status'] == 'applied'
        finished = sql(f"select finished_at from public.workout_instances where id='{workout}'")

        same = command(new_note('same request'))
        outcomes = race(lambda: correct(same), lambda: correct(same))
        assert outcomes[0] == outcomes[1] and outcomes[0]['ok'], outcomes
        assert sql(f"select count(*) from private.workout_correction_receipts where request_id='{same['request']}'") == '1'
        assert sql(f"select count(*) from private.workout_correction_audit where request_id='{same['request']}'") == '1'

        one = command(new_note('two IDs'))
        two = dict(one, request=str(uuid.uuid4()))
        outcomes = race(lambda: correct(one), lambda: correct(two))
        assert sum(outcome['ok'] for outcome in outcomes) == 1, outcomes
        assert 'draft_already_applied' in next(outcome['error'] for outcome in outcomes if not outcome['ok']), outcomes

        one = command(new_note('reused request'))
        two = dict(one, entity=99)
        outcomes = race(lambda: correct(one), lambda: correct(two))
        assert outcomes[0]['ok'] and not outcomes[1]['ok'], outcomes
        assert any(code in outcomes[1]['error'] for code in ('stale_correction', 'request_id_reused')), outcomes
        assert 'request_id_reused' in correct(two)['error']

        first_draft = new_note('first parallel draft')
        second_draft = new_note('second parallel draft')
        one, two = command(first_draft), command(second_draft)
        assert one['workout'] == two['workout']
        outcomes = race(lambda: correct(one), lambda: correct(two))
        assert sum(outcome['ok'] for outcome in outcomes) == 1, outcomes
        loser = next(outcome for outcome in outcomes if not outcome['ok'])
        assert 'stale_correction' in loser['error'], outcomes
        winner = next(index for index, outcome in enumerate(outcomes) if outcome['ok'])
        winner_command = one if winner == 0 else two
        assert correct(winner_command) == outcomes[winner], 'Winner must replay after competing draft fails'

        one = command(new_note('overlap ordinary sync'))
        ordinary = operation('set_note', str(uuid.uuid4()), 0,
                             dict(workout_instance_id=workout, text='ordinary offline note', shared=False))
        outcomes = race(lambda: correct(one), lambda: sync(ordinary))
        assert outcomes[0]['ok'] and outcomes[1]['status'] == 'correction_draft', outcomes
        assert sql(f"select count(*) from public.private_notes where id='{ordinary['entity_id']}'") == '0'
        assert sql(f"select finished_at from public.workout_instances where id='{workout}'") == finished
        assert sql(f"select count(*) from private.workout_correction_receipts where workspace_id='{workspace}'") == '5'
        assert sql(f"select count(*) from private.workout_correction_audit where workspace_id='{workspace}'") == '5'
        print('PASS: independent sessions replay one receipt, consume drafts once, reject changed requests and competing stale drafts, and preserve overlapping ordinary-sync draft and finish timestamp.')
    finally:
        sql(f"""begin;
set local session_replication_role=replica;
delete from private.workout_correction_audit where workspace_id='{workspace}';
delete from private.workout_correction_receipts where workspace_id='{workspace}';
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
