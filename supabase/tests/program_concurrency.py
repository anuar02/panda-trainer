"""Verify that simultaneous assignment retries create one program snapshot."""
import argparse
import json
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
           '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner, workspace, client, request_id = (str(uuid.uuid4()) for _ in range(4))
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


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{owner}', 'Program concurrency fixture');
      insert into public.client_records (id, workspace_id, display_name)
        values ('{client}', '{workspace}', 'Program concurrency client');
      commit;""")
    exercise = query(f"select id from public.exercises where workspace_id = '{workspace}' and source_key = 'e0';")
    payload = json.dumps([{'exercise_id': exercise, 'planned_sets': 3, 'planned_reps': '8'}])
    initial = result_from(query('begin; ' + identity() +
        f"select public.save_workout_template(null, null, 'Program source', '', '{payload}'::jsonb, '{uuid.uuid4()}'); commit;"))
    assignment = (f"select public.assign_client_program('{client}', '{initial['id']}', "
                  f"{initial['revision']}, '{request_id}');")
    first = connect('begin; ' + identity() + assignment + ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert not first_result['replayed']
    assert first.poll() is None, 'First assignment must still hold its workspace lock'
    application = 'program-race-' + str(uuid.uuid4())
    second = connect(f"set application_name = '{application}'; begin; " + identity() + assignment + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second assignment must wait on the same workspace lock'
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    assert second.returncode == 0, second_error
    second_result = result_from(second_output)
    assert second_result['replayed']
    assert second_result['id'] == first_result['id']
    assert second_result['revision'] == first_result['revision']
    assert query(f"select count(*) from public.client_programs where workspace_id = '{workspace}';") == '1'
    assert query(f"select count(*) from public.client_program_exercises where workspace_id = '{workspace}';") == '1'
    print('PASS: concurrent assignment retries create one complete program snapshot')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from public.client_program_exercises where workspace_id = '{workspace}';
      delete from public.client_programs where workspace_id = '{workspace}';
      delete from private.program_assignment_receipts where workspace_id = '{workspace}';
      delete from public.template_exercises where workspace_id = '{workspace}';
      delete from public.workout_templates where workspace_id = '{workspace}';
      delete from private.template_command_receipts where workspace_id = '{workspace}';
      delete from public.client_records where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from auth.users where id = '{owner}';
      commit;""")
