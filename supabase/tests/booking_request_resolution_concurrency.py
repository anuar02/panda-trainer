"""Verify atomic request abandonment versus delayed scheduling commands."""
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


def run_race(first_sql, second_sql, first_actor, second_actor, error_code=None, first_end="commit"):
    first = connect('begin; ' + identity(first_actor) + first_sql + f' select pg_sleep(3); {first_end};')
    first_result = result_from(first.stdout.readline())
    assert first.poll() is None
    application = 'resolution-race-' + str(uuid.uuid4())
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



def create_booking(start):
    result = result_from(query('begin; ' + identity() +
        f"select public.create_booking_set(array['{client}']::uuid[],'{start.isoformat()}',"
        f"'{(start + datetime.timedelta(hours=1)).isoformat()}',false,'{uuid.uuid4()}'); commit;"))
    return result['booking_ids'][0]


def status(booking, request):
    return f"select public.cancel_booking('{booking}',1,'{request}');"


def resolve_status(booking, request):
    return f"select public.resolve_booking_status_request('cancel','{booking}',1,'{request}');"


def propose(booking, target, request):
    return f"select public.propose_booking_reschedule('{booking}',1,'{target.isoformat()}','{request}');"


def resolve_propose(booking, target, request):
    return (f"select public.resolve_booking_reschedule_request('propose','{booking}',null,1,null,"
            f"'{target.isoformat()}','{request}');")


try:
    query(f"""begin;
      insert into auth.users(id,aud,role,email) values
        ('{owner}','authenticated','authenticated','{owner}@example.test'),
        ('{client_user}','authenticated','authenticated','{client_user}@example.test');
      insert into public.trainer_workspaces(id,owner_user_id,name)
        values('{workspace}','{owner}','Resolution race fixture');
      insert into public.client_records(id,workspace_id,user_id,display_name)
        values('{client}','{workspace}','{client_user}','Resolution race client');
      commit;""")
    start = datetime.datetime.now(datetime.timezone.utc).replace(hour=10,minute=0,second=0,microsecond=0) + datetime.timedelta(days=2)
    booking = create_booking(start)
    request = str(uuid.uuid4())
    first, _ = run_race(resolve_status(booking, request),status(booking,request),owner,owner,'55000')
    assert first['outcome'] == 'abandoned'
    assert query(f"select revision from public.bookings where id='{booking}';") == '1'
    assert query(f"select status from public.bookings where id='{booking}';") == 'proposed'
    replay = result_from(query('begin; ' + identity() + resolve_status(booking,request) + ' commit;'))
    assert replay == first
    print('PASS: resolution-first blocks delayed cancellation and repeats exact tombstone')

    request = str(uuid.uuid4())
    original, resolved = run_race(status(booking,request),resolve_status(booking,request),owner,owner)
    assert resolved['outcome'] == 'succeeded'
    assert resolved['result'] == dict(original,replayed=True)
    assert query(f"select revision from public.bookings where id='{booking}';") == '2'
    print('PASS: command-first returns successful receipt, never abandons committed cancellation')

    booking = create_booking(start + datetime.timedelta(days=1))
    target = start + datetime.timedelta(days=3)
    request = str(uuid.uuid4())
    first, _ = run_race(resolve_propose(booking,target,request),propose(booking,target,request),owner,owner,'55000')
    assert first['outcome'] == 'abandoned'
    assert query(f"select count(*) from public.schedule_proposals where booking_id='{booking}';") == '0'
    print('PASS: resolution-first blocks delayed proposal creation')

    request = str(uuid.uuid4())
    original, resolved = run_race(propose(booking,target,request),resolve_propose(booking,target,request),owner,owner)
    assert resolved['outcome'] == 'succeeded'
    assert resolved['result'] == dict(original,replayed=True)
    proposal = original['proposal_id']
    print('PASS: proposal-first returns exact successful receipt')

    request = str(uuid.uuid4())
    accept = f"select public.accept_booking_reschedule('{proposal}',1,1,'{request}');"
    resolve_accept = f"select public.resolve_booking_reschedule_request('accept',null,'{proposal}',1,1,null,'{request}');"
    first, _ = run_race(resolve_accept,accept,client_user,client_user,'55000')
    assert first['outcome'] == 'abandoned'
    assert query(f"select revision from public.bookings where id='{booking}';") == '1'
    assert query(f"select status from public.schedule_proposals where id='{proposal}';") == 'pending'
    print('PASS: resolution-first blocks delayed accept and preserves original interval')

    request = str(uuid.uuid4())
    accept = f"select public.accept_booking_reschedule('{proposal}',1,1,'{request}');"
    resolve_accept = f"select public.resolve_booking_reschedule_request('accept',null,'{proposal}',1,1,null,'{request}');"
    original, resolved = run_race(accept,resolve_accept,client_user,client_user)
    assert resolved['outcome'] == 'succeeded'
    assert resolved['result'] == dict(original,replayed=True)
    assert query(f"select revision from public.bookings where id='{booking}';") == '2'
    assert query(f"select status from public.schedule_proposals where id='{proposal}';") == 'accepted'
    print('PASS: acceptance-first returns exact receipt after booking and proposal revisions change')

    booking = create_booking(start + datetime.timedelta(days=2))
    request = str(uuid.uuid4())
    original, resolved = run_race(status(booking,request),resolve_status(booking,request),
                                owner,owner,first_end="rollback")
    assert original['status'] == 'cancelled_by_trainer'
    assert resolved['outcome'] == 'abandoned'
    assert query(f"select revision from public.bookings where id='{booking}';") == '1'
    assert query(f"select status from public.bookings where id='{booking}';") == 'proposed'
    assert query(f"select count(*) from private.booking_status_command_receipts where workspace_id='{workspace}' and request_id='{request}';") == '0'
    print('PASS: rolled-back cancellation resolves as abandoned without leaking an uncommitted receipt')

    request = str(uuid.uuid4())
    resolved, result = run_race(resolve_propose(booking,target + datetime.timedelta(days=1),request),
                               propose(booking,target + datetime.timedelta(days=1),request),owner,owner,first_end="rollback")
    assert resolved['outcome'] == 'abandoned'
    assert result['proposal_status'] == 'pending'
    assert query(f"select count(*) from private.booking_command_abandonments where workspace_id='{workspace}' and request_id='{request}';") == '0'
    print('PASS: rolled-back resolution does not falsely abandon the original command')

    assert query(f"""select count(*) from private.booking_command_abandonments a
      where a.workspace_id='{workspace}' and (
        (a.command_family='status' and exists(select 1 from private.booking_status_command_receipts r
          where (r.workspace_id,r.actor_user_id,r.request_id)=(a.workspace_id,a.actor_user_id,a.request_id))) or
        (a.command_family='reschedule' and exists(select 1 from private.booking_reschedule_receipts r
          where (r.workspace_id,r.actor_user_id,r.request_id)=(a.workspace_id,a.actor_user_id,a.request_id))));""") == '0'
    print('PASS: successful receipts and tombstones never coexist for the same scoped request')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from private.booking_command_abandonments where workspace_id='{workspace}';
      delete from private.booking_status_command_receipts where workspace_id='{workspace}';
      delete from private.booking_reschedule_receipts where workspace_id='{workspace}';
      delete from public.schedule_proposals where workspace_id='{workspace}';
      delete from private.booking_creation_receipts where workspace_id='{workspace}';
      delete from public.bookings where workspace_id='{workspace}';
      delete from public.group_sessions where workspace_id='{workspace}';
      delete from public.client_records where workspace_id='{workspace}';
      delete from public.exercises where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from auth.users where id in ('{owner}','{client_user}');
      commit;""")
