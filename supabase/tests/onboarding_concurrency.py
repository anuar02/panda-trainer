"""Verify concurrent first-time trainer onboarding serializes across connections."""
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
owner = str(uuid.uuid4())
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


def identity():
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}'; ")


def provisioning(display_name, workspace_name, focus, day, start, end, minutes, client_name, client_phone):
    return ("select public.complete_trainer_onboarding(" +
            f"'{display_name}', '{workspace_name}', array['{focus}'], array[{day}], " +
            f"'{start}', '{end}', {minutes}, '{client_name}', '{client_phone}');")


def result_from(line):
    return json.loads(line)


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test');
      commit;""")
    first = connect('begin; ' + identity() + provisioning(
        'Concurrency trainer', 'Concurrency studio', 'strength', 1, '07:00', '21:00', 60,
        'Concurrency client', '555-0101') +
                    ' select pg_sleep(2); commit;')
    first_result = result_from(first.stdout.readline())
    assert first.poll() is None, 'First onboarding transaction must still hold its user lock'

    application = 'onboarding-race-' + str(uuid.uuid4())
    second = connect(f"set application_name = '{application}'; begin; " + identity() +
                     provisioning('Changed trainer', 'Changed studio', 'boxing', 4, '09:00', '17:00', 45,
                                  'Changed client', '999') + ' commit;')
    blocked = False
    for _ in range(40):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second onboarding call must wait on the first user lock'

    first_output, first_error = first.communicate(timeout=15)
    second_output, second_error = second.communicate(timeout=15)
    assert first.returncode == 0, first_error
    assert second.returncode == 0, second_error
    second_result = result_from(next(line for line in second_output.splitlines() if line.startswith('{')))
    assert second_result['id'] == first_result['id'], 'Concurrent retry must return the same workspace'
    assert second_result['name'] == first_result['name'] == 'Concurrency studio', \
        'Concurrent retry must preserve the first workspace name'
    assert query(f"select count(*) from public.trainer_workspaces where owner_user_id = '{owner}';") == '1'
    assert query(f"select count(*) from public.profiles where user_id = '{owner}' and display_name = 'Concurrency trainer';") == '1'
    assert query(f"select count(*) from public.trainer_workspaces where owner_user_id = '{owner}' and training_focus = array['strength']::text[] and working_days = array[1]::integer[] and day_start = '07:00' and day_end = '21:00' and usual_session_minutes = 60;") == '1'
    assert query(f"select count(*) from public.client_records c join public.trainer_workspaces w on w.id = c.workspace_id where w.owner_user_id = '{owner}' and c.display_name = 'Concurrency client' and c.phone = '555-0101';") == '1'
    assert query(f"select count(*) from public.client_records c join public.trainer_workspaces w on w.id = c.workspace_id where w.owner_user_id = '{owner}';") == '1'
    assert query(f"select count(*) from public.exercises e join public.trainer_workspaces w on w.id = e.workspace_id where w.owner_user_id = '{owner}';") == '81'
    print('PASS: concurrent onboarding creates one profile, workspace, first client, and 81-exercise catalog')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from public.client_records where workspace_id in
        (select id from public.trainer_workspaces where owner_user_id = '{owner}');
      delete from public.exercises where workspace_id in
        (select id from public.trainer_workspaces where owner_user_id = '{owner}');
      delete from public.trainer_workspaces where owner_user_id = '{owner}';
      delete from public.profiles where user_id = '{owner}';
      delete from auth.users where id = '{owner}';
      commit;""")
