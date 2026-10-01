"""Verify schedule serialization using two real PostgreSQL connections."""
import argparse
import datetime
import json
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql',
           '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner, workspace, client = (str(uuid.uuid4()) for _ in range(3))
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


def request(request_id, day):
    start = datetime.datetime.combine(day, datetime.time(10), datetime.timezone.utc)
    end = start + datetime.timedelta(hours=1)
    return (f"select public.create_booking_set(array['{client}']::uuid[], "
            f"'{start.isoformat()}', '{end.isoformat()}', false, '{request_id}');")


def identity():
    return ("set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}'; ")


def race(same_request, day):
    first_id = str(uuid.uuid4())
    second_id = first_id if same_request else str(uuid.uuid4())
    first = connect('begin; ' + identity() + request(first_id, day) +
                    ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert first_result['created'] and not first_result['replayed']
    assert first.poll() is None, 'First transaction must still hold its lock'
    application = 'schedule-race-' + str(uuid.uuid4())
    second = connect(f"set application_name = '{application}'; begin; " +
                     identity() + request(second_id, day) + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second RPC must wait on the workspace transaction lock'
    first_output, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    assert second.returncode == 0, second_error
    second_result = result_from(second_output)
    if same_request:
        assert second_result['created'] and second_result['replayed']
        assert first_result['booking_ids'] == second_result['booking_ids']
    else:
        assert not second_result['created'] and second_result['requires_overlap_ack']
        assert len(second_result['overlaps']) == 1
    print('PASS: concurrent retry returns one booking' if same_request else
          'PASS: concurrent overlapping create waits, then requires acknowledgement')


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{owner}', 'Concurrency fixture');
      insert into public.client_records (id, workspace_id, display_name)
        values ('{client}', '{workspace}', 'Concurrency client');
      commit;""")
    tomorrow = datetime.datetime.now(datetime.timezone.utc).date() + datetime.timedelta(days=1)
    race(False, tomorrow)
    race(True, tomorrow + datetime.timedelta(days=1))
    assert query(f"select count(*) from public.bookings where workspace_id = '{workspace}';") == '2'
    print('PASS: exactly two committed bookings across both concurrent scenarios')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from public.schedule_proposals where workspace_id = '{workspace}';
      delete from public.bookings where workspace_id = '{workspace}';
      delete from public.group_sessions where workspace_id = '{workspace}';
      delete from public.client_records where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from auth.users where id = '{owner}';
      commit;""")
