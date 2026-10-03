"""Run with DATABASE_URL against a disposable migrated PostgreSQL database."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import threading


def sql(statement):
    result = subprocess.run(
        ['psql', os.environ['DATABASE_URL'], '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
        input=statement, text=True, capture_output=True,
    )
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def main():
    fixture = Path(__file__).with_name('database').joinpath('som31_prepare_workout_journal.test.sql').read_text()
    setup = fixture[fixture.index('insert into auth.users'):fixture.index('select ok(')]
    owner = '00000001-0000-4000-8000-000000000031'
    booking = '00000005-0000-4000-8000-000000000031'
    workout = '00000009-0000-4000-8000-000000000031'
    request = '00000010-0000-4000-8000-000000000031'
    workspace = '00000003-0000-4000-8000-000000000031'
    try:
        sql('begin;\n' + setup + '\ncommit;')
        for same_request in (True, False):
            if not same_request:
                sql(f"""begin;
delete from private.workout_preparation_receipts where workspace_id='{workspace}';
delete from public.workout_exercises where workspace_id='{workspace}';
delete from public.workout_instances where workspace_id='{workspace}';
commit;""")
            barrier = threading.Barrier(2)

            def prepare(index):
                barrier.wait(timeout=10)
                selected = request if same_request or index == 0 else '00000011-0000-4000-8000-000000000031'
                requested_workout = workout if same_request or index == 0 else '00000012-0000-4000-8000-000000000031'
                return json.loads(sql(f"""begin;
set local role authenticated;
set local request.jwt.claim.sub='{owner}';
select public.prepare_workout_journal('{booking}','{requested_workout}','{selected}');
select pg_sleep(1);
commit;"""))

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                responses = list(executor.map(prepare, range(2)))
            assert responses[0] == responses[1], responses
            assert responses[0]['workout_id'] in (workout, '00000012-0000-4000-8000-000000000031'), responses
            assert responses[0]['exercises'] == [dict(id='00000008-0000-4000-8000-000000000031', position=0, revision=1)], responses
            winning_workout = responses[0]['workout_id']
        assert sql(f"select count(*) from public.workout_instances where booking_id='{booking}';") == '1'
        assert sql(f"select count(*) from public.workout_exercises where workout_instance_id='{winning_workout}';") == '1'
        assert sql(f"select count(*) from private.workout_preparation_receipts where workspace_id='{workspace}';") == '2'
        print('SOM31 concurrent exact replay and second-device preparation passed')
    finally:
        sql(f"""begin;
delete from private.workout_preparation_receipts where workspace_id='{workspace}';
delete from public.workout_exercises where workspace_id='{workspace}';
delete from public.workout_instances where workspace_id='{workspace}';
delete from public.booking_program_exercises where workspace_id='{workspace}';
delete from public.booking_programs where workspace_id='{workspace}';
delete from public.bookings where workspace_id='{workspace}';
delete from public.template_exercises where workspace_id='{workspace}';
delete from public.workout_templates where workspace_id='{workspace}';
delete from public.client_records where workspace_id='{workspace}';
delete from public.exercises where workspace_id='{workspace}';
delete from public.trainer_workspaces where id='{workspace}';
delete from public.profiles where user_id in ('{owner}','00000002-0000-4000-8000-000000000031');
delete from auth.users where id in ('{owner}','00000002-0000-4000-8000-000000000031');
commit;""")


if __name__ == '__main__':
    main()
