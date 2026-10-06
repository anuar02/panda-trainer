"""Verify optimistic template edits and retry receipts across real connections."""
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
owner, workspace = (str(uuid.uuid4()) for _ in range(2))
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


def save(template, revision, name, request_id):
    return (f"select public.save_workout_template({template}, {revision}, '{name}', '', "
            f"'{exercise_json}'::jsonb, '{request_id}');")


def race(same_request):
    revision = query(f"select revision from public.workout_templates where id = '{template_id}';")
    first_id = str(uuid.uuid4())
    name = 'Retry edit' if same_request else 'Winning edit'
    first = connect('begin; ' + identity() + save(f"'{template_id}'", revision, name, first_id) +
                    ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert not first_result['replayed']
    assert first.poll() is None, 'First template transaction must still hold its lock'
    application = 'template-race-' + str(uuid.uuid4())
    second = connect("\\set VERBOSITY sqlstate\n" +
                     f"set application_name = '{application}'; begin; " + identity() +
                     save(f"'{template_id}'", revision, name if same_request else 'Losing edit',
                          first_id if same_request else str(uuid.uuid4())) + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second save must wait on the workspace transaction lock'
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    if same_request:
        assert second.returncode == 0, second_error
        second_result = result_from(second_output)
        assert second_result['replayed']
        assert second_result['id'] == first_result['id']
        assert second_result['revision'] == first_result['revision']
    else:
        assert second.returncode != 0 and '40001' in second_error, second_error
    assert query(f"select name from public.workout_templates where id = '{template_id}';") == name
    assert query(f"select count(*) from public.template_exercises where template_id = '{template_id}';") == '1'
    print('PASS: concurrent template retry replays the committed revision' if same_request else
          'PASS: concurrent stale edit is rejected without overwriting the winning template')


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{owner}', 'Template concurrency fixture');
      commit;""")
    exercise = query(f"select id from public.exercises where workspace_id = '{workspace}' and source_key = 'e0';")
    exercise_json = json.dumps([{'exercise_id': exercise, 'planned_sets': 3, 'planned_reps': '8',
                                'planned_seconds': None, 'planned_weight_g': 1000,
                                'rest_seconds': 30, 'note': None}])
    initial = query('begin; ' + identity() + save('null', 'null', 'Initial fixture', str(uuid.uuid4())) + ' commit;')
    template_id = result_from(initial)['id']
    race(False)
    race(True)
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from public.template_exercises where workspace_id = '{workspace}';
      delete from public.workout_templates where workspace_id = '{workspace}';
      delete from private.template_command_receipts where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from auth.users where id = '{owner}';
      commit;""")
