"""Verify reschedule proposal races and immutable accept receipts."""
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
owner, workspace, client, client_user = (str(uuid.uuid4()) for _ in range(4))
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


def identity(actor=None):
    actor = actor or owner
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{actor}\",\"role\":\"authenticated\"}}'; ")


def run_race(first_sql, second_sql, first_actor, second_actor, error_code=None):
    first = connect('begin; ' + identity(first_actor) + first_sql + ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert first.poll() is None
    application = 'reschedule-race-' + str(uuid.uuid4())
    second = connect("\\set VERBOSITY sqlstate\n" +
                     f"set application_name='{application}'; begin; " + identity(second_actor) + second_sql + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name='{application}' and wait_event_type='Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second command must wait for workspace transaction lock'
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    if error_code:
        assert second.returncode != 0 and error_code in second_error, second_error
        return first_result, None
    assert second.returncode == 0, second_error
    return first_result, result_from(second_output)


def propose(target):
    return f"select public.propose_booking_reschedule('{booking}',1,'{target.isoformat()}','{uuid.uuid4()}');"


try:
    query(f"""begin;
      insert into auth.users(id,aud,role,email) values
        ('{owner}','authenticated','authenticated','{owner}@example.test'),
        ('{client_user}','authenticated','authenticated','{client_user}@example.test');
      insert into public.trainer_workspaces(id,owner_user_id,name)
        values('{workspace}','{owner}','Reschedule race fixture');
      insert into public.client_records(id,workspace_id,user_id,display_name)
        values('{client}','{workspace}','{client_user}','Race client');
      commit;""")
    start = datetime.datetime.now(datetime.timezone.utc).replace(hour=10,minute=0,second=0,microsecond=0) + datetime.timedelta(days=2)
    end = start + datetime.timedelta(hours=1)
    target = start + datetime.timedelta(days=1)
    created = result_from(query('begin; ' + identity() +
        f"select public.create_booking_set(array['{client}']::uuid[],'{start.isoformat()}','{end.isoformat()}',false,'{uuid.uuid4()}'); commit;"))
    booking = created['booking_ids'][0]
    first, _ = run_race(propose(target),propose(target + datetime.timedelta(days=1)),owner,client_user,'55000')
    proposal = first['proposal_id']
    assert query(f"select count(*) from public.schedule_proposals where booking_id='{booking}' and status='pending';") == '1'
    assert query(f"select revision from public.bookings where id='{booking}';") == '1'
    print('PASS: simultaneous proposals commit one pending target and preserve original booking')

    request_id = str(uuid.uuid4())
    accept = f"select public.accept_booking_reschedule('{proposal}',1,1,'{request_id}');"
    first, second = run_race(accept,accept,client_user,client_user)
    assert not first['replayed'] and second['replayed']
    assert {key:value for key,value in first.items() if key!='replayed'} == {key:value for key,value in second.items() if key!='replayed'}
    assert query(f"select revision from public.bookings where id='{booking}';") == '2'
    print('PASS: concurrent accept retry moves once and replays exact receipt')

    target += datetime.timedelta(days=2)
    proposal = result_from(query('begin; ' + identity() +
        f"select public.propose_booking_reschedule('{booking}',2,'{target.isoformat()}','{uuid.uuid4()}'); commit;"))['proposal_id']
    first, _ = run_race(f"select public.accept_booking_reschedule('{proposal}',1,2,'{uuid.uuid4()}');",
        f"select public.counter_booking_reschedule('{proposal}',1,2,'{(target + datetime.timedelta(days=1)).isoformat()}','{uuid.uuid4()}');",
        client_user,client_user,'40001')
    assert first['booking_revision'] == 3
    assert query(f"select status from public.schedule_proposals where id='{proposal}';") == 'accepted'
    print('PASS: stale counter cannot overwrite concurrent accepted move')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from private.booking_reschedule_receipts where workspace_id='{workspace}';
      delete from public.schedule_proposals where workspace_id='{workspace}';
      delete from private.booking_creation_receipts where workspace_id = '{workspace}';
      delete from public.bookings where workspace_id='{workspace}';
      delete from public.group_sessions where workspace_id='{workspace}';
      delete from public.client_records where workspace_id='{workspace}';
      delete from public.exercises where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from auth.users where id in ('{owner}','{client_user}');
      commit;""")
