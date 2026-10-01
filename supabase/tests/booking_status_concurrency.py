"""Exercise concurrent booking confirmation, cancellation and retry receipts."""
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
owner, member, workspace, client = (str(uuid.uuid4()) for _ in range(4))
processes = []


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def connect(sql):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    processes.append(process)
    process.stdin.write(sql)
    process.stdin.close()
    process.stdin = None
    return process


def identity(user):
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{user}\",\"role\":\"authenticated\"}}'; ")


def result_from(output):
    return next(json.loads(line) for line in output.splitlines() if line.startswith('{'))


def race(retry):
    booking, request_id = (str(uuid.uuid4()) for _ in range(2))
    query(f"""insert into public.bookings (id, workspace_id, client_record_id, starts_at, ends_at, status)
      values ('{booking}', '{workspace}', '{client}', now() + interval '2 days',
              now() + interval '2 days 1 hour', 'proposed');""")
    confirmation = f"select public.confirm_booking('{booking}', 1, '{request_id}');"
    first = connect('begin; ' + identity(member) + confirmation + ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert not first_result['replayed'] and first_result['status'] == 'confirmed'
    assert first.poll() is None, 'First confirmation must still hold its workspace lock'
    application = 'booking-race-' + str(uuid.uuid4())
    competing = confirmation if retry else f"select public.cancel_booking('{booking}', 1, '{uuid.uuid4()}');"
    second = connect("\\set VERBOSITY sqlstate\n" +
                     f"set application_name = '{application}'; begin; " +
                     identity(member if retry else owner) + competing + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second command must wait on the workspace lock'
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    if retry:
        assert second.returncode == 0, second_error
        result = result_from(second_output)
        assert result['replayed']
        assert result['booking_id'] == first_result['booking_id']
        assert result['revision'] == first_result['revision']
    else:
        assert second.returncode != 0 and '40001' in second_error, second_error
    assert query(f"select status || '|' || revision::text from public.bookings where id = '{booking}';") == 'confirmed|2'
    print('PASS: concurrent confirmation retry returns the original result' if retry else
          'PASS: concurrent stale cancellation cannot overwrite confirmation')


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email) values
        ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test'),
        ('{member}', 'authenticated', 'authenticated', '{member}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{owner}', 'Booking status concurrency fixture');
      insert into public.client_records (id, workspace_id, user_id, display_name)
        values ('{client}', '{workspace}', '{member}', 'Booking status member');
      commit;""")
    race(False)
    race(True)
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from private.booking_status_command_receipts where workspace_id = '{workspace}';
      delete from public.bookings where workspace_id = '{workspace}';
      delete from public.client_records where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from auth.users where id in ('{owner}', '{member}');
      commit;""")
