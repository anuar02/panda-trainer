import argparse
import json
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner, client_user, workspace, client, booking, request = (str(uuid.uuid4()) for _ in range(6))
processes = []


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def connect(sql):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    processes.append(process)
    process.stdin.write(sql)
    process.stdin.close()
    process.stdin = None
    return process


def identity(actor):
    return f"set local statement_timeout='10s'; set local role authenticated; set local request.jwt.claims='{{\"sub\":\"{actor}\",\"role\":\"authenticated\"}}';"


def race(sql, actor):
    first = connect('begin;' + identity(actor) + sql + 'select pg_sleep(3); commit;')
    original = first.stdout.readline().strip()
    assert original.startswith('{'), original
    application = 'notification-race-' + str(uuid.uuid4())
    second = connect(f"set application_name='{application}'; begin;" + identity(actor) + sql + 'commit;')
    blocked = False
    for _ in range(30):
        if query(f"select count(*) from pg_stat_activity where application_name='{application}' and wait_event_type='Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Concurrent retry must wait for the first transaction'
    _, error = first.communicate(timeout=15)
    assert first.returncode == 0, error
    output, error = second.communicate(timeout=15)
    assert second.returncode == 0, error
    replay = next(line for line in output.splitlines() if line.startswith('{'))
    return json.loads(original), json.loads(replay)


try:
    query(f"""begin;
    insert into auth.users(id,aud,role,email) values
      ('{owner}','authenticated','authenticated','{owner}@example.test'),
      ('{client_user}','authenticated','authenticated','{client_user}@example.test');
    insert into public.trainer_workspaces(id,owner_user_id,name) values('{workspace}','{owner}','Synthetic notification race');
    insert into public.client_records(id,workspace_id,user_id,display_name) values('{client}','{workspace}','{client_user}','Synthetic client');
    set local request.jwt.claims='{{"sub":"{owner}","role":"authenticated"}}';
    insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at)
      values('{booking}','{workspace}','{client}',now()+interval '40 days',now()+interval '40 days 1 hour');
    commit;""")
    original, replay = race(f"select public.confirm_booking('{booking}',1,'{request}');", client_user)
    assert replay['replayed'] is True or replay['replayed'] == 'true'
    assert query(f"select count(*) from public.notifications where workspace_id='{workspace}' and kind='booking_confirmed';") == '1'
    notification = query(f"select id from public.notifications where workspace_id='{workspace}' and recipient_user_id='{client_user}';")
    original, replay = race(f"select public.mark_notification_read('{workspace}','{notification}');", client_user)
    assert original['read_at'] == replay['read_at'] and original['read_at'] is not None
    assert query(f"begin; {identity(client_user)} select public.notification_feed('{workspace}','{client}')->>'unread_count'; commit;") == '0'
    assert query(f"select count(*) from public.notifications where workspace_id='{workspace}';") == '2'
    print('PASS notification concurrent command replay and monotonic read state')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from private.booking_status_command_receipts where workspace_id='{workspace}';
      delete from public.notifications where workspace_id='{workspace}';
      delete from public.bookings where workspace_id='{workspace}';
      delete from public.client_records where workspace_id='{workspace}';
      delete from public.exercises where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from public.profiles where user_id in ('{owner}','{client_user}');
      delete from auth.users where id in ('{owner}','{client_user}');
      commit;""")
