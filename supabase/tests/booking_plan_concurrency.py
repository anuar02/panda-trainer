"""Verify atomic booking plan snapshots and racing template edits."""
import argparse
import datetime
import json
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
           '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner, workspace, client_a, client_b = (str(uuid.uuid4()) for _ in range(4))
processes = []


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout or str(result.returncode))
    return result.stdout.strip()


def connect(sql):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    processes.append(process)
    process.stdin.write(sql)
    process.stdin.close()
    process.stdin = None
    return process


def result_from(output):
    return next(json.loads(line) for line in output.splitlines() if line.startswith('{'))


def identity():
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}'; ")


def save(template, revision, name, sets):
    exercise_json = json.dumps([{'exercise_id': exercise, 'planned_sets': sets,
                                'planned_reps': '8', 'planned_seconds': None,
                                'planned_weight_g': 1000, 'rest_seconds': 30, 'note': name}])
    return (f"select public.save_workout_template({template}, {revision}, '{name}', '', "
            f"'{exercise_json}'::jsonb, '{uuid.uuid4()}');")


def create(request_id, revision, day):
    start = datetime.datetime.combine(day, datetime.time(10), datetime.timezone.utc)
    end = start + datetime.timedelta(hours=1)
    return (f"select public.create_booking_set_with_plan(array['{client_a}','{client_b}']::uuid[], "
            f"'{start.isoformat()}', '{end.isoformat()}', false, '{request_id}', "
            f"'{template_id}', {revision});")


def run_race(first_sql, second_sql, expect_stale=False):
    first = connect('begin; ' + identity() + first_sql + ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert first.poll() is None, 'First transaction must still hold its lock'
    application = 'booking-plan-race-' + str(uuid.uuid4())
    second = connect("\\set VERBOSITY sqlstate\n" +
                     f"set application_name = '{application}'; begin; " +
                     identity() + second_sql + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second command must wait on a transaction lock'
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    if expect_stale:
        assert second.returncode != 0 and '40001' in second_error, second_error
        return first_result, None
    assert second.returncode == 0, second_error
    return first_result, result_from(second_output)


def snapshot_count():
    return query(f"select count(*) from public.booking_programs where workspace_id = '{workspace}';")


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{owner}', 'Booking plan concurrency fixture');
      insert into public.client_records (id, workspace_id, display_name)
        values ('{client_a}', '{workspace}', 'Plan client A'),
               ('{client_b}', '{workspace}', 'Plan client B');
      commit;""")
    exercise = query(f"select id from public.exercises where workspace_id = '{workspace}' and source_key = 'e0';")
    template_id = result_from(query('begin; ' + identity() +
                             save('null', 'null', 'Initial plan', 3) + ' commit;'))['id']
    revision = query(f"select revision from public.workout_templates where id = '{template_id}';")
    tomorrow = datetime.datetime.now(datetime.timezone.utc).date() + datetime.timedelta(days=1)
    request_id = str(uuid.uuid4())
    first, second = run_race(create(request_id, revision, tomorrow),
                             create(request_id, revision, tomorrow))
    assert first['created'] and not first['replayed']
    assert second['created'] and second['replayed']
    assert first['booking_ids'] == second['booking_ids']
    assert snapshot_count() == '2'
    assert query(f"select count(*) from public.booking_program_exercises where workspace_id = '{workspace}';") == '2'
    print('PASS: concurrent group retry creates exactly one snapshot per participant')

    first, _ = run_race(create(str(uuid.uuid4()), revision, tomorrow + datetime.timedelta(days=1)),
                        save(f"'{template_id}'", revision, 'Updated plan', 5))
    assert first['created']
    assert query(f"select count(*) from public.booking_programs p join public.booking_program_exercises e "
                 f"on e.booking_program_id=p.id where p.workspace_id='{workspace}' "
                 "and p.name='Initial plan' and e.planned_sets=3 and e.note='Initial plan';") == '4'
    assert query(f"select name from public.workout_templates where id='{template_id}';") == 'Updated plan'
    print('PASS: create winning the race keeps coherent old snapshots after template update')

    revision = query(f"select revision from public.workout_templates where id='{template_id}';")
    run_race(save(f"'{template_id}'", revision, 'Newest plan', 7),
             create(str(uuid.uuid4()), revision, tomorrow + datetime.timedelta(days=2)), True)
    assert snapshot_count() == '4'
    assert query(f"select count(*) from public.bookings where workspace_id='{workspace}';") == '4'
    assert query(f"select count(*) from public.group_sessions where workspace_id='{workspace}';") == '2'
    assert query(f"select count(*) from public.booking_program_exercises where workspace_id='{workspace}';") == '4'
    print('PASS: template update winning the race rejects stale create without partial rows')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from public.booking_program_exercises where workspace_id = '{workspace}';
      delete from public.booking_programs where workspace_id = '{workspace}';
      delete from private.booking_creation_receipts where workspace_id = '{workspace}';
      delete from public.bookings where workspace_id = '{workspace}';
      delete from public.group_sessions where workspace_id = '{workspace}';
      delete from public.template_exercises where workspace_id = '{workspace}';
      delete from public.workout_templates where workspace_id = '{workspace}';
      delete from private.template_command_receipts where workspace_id = '{workspace}';
      delete from public.client_records where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from auth.users where id = '{owner}';
      commit;""")
