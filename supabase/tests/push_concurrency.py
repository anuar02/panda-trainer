import argparse
import json
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner, user, workspace, client, booking, device, session, generation = (str(uuid.uuid4()) for _ in range(8))
processes = []


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError('Synthetic push SQL failed')
    return result.stdout.strip()


def connect(sql):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    processes.append(process)
    process.stdin.write(sql)
    process.stdin.close()
    process.stdin = None
    return process


try:
    query(f"""begin;
    insert into auth.users(id,aud,role,email) values ('{owner}','authenticated','authenticated','{owner}@example.test'),('{user}','authenticated','authenticated','{user}@example.test');
    insert into public.trainer_workspaces(id,owner_user_id,name) values('{workspace}','{owner}','Synthetic push race');
    insert into public.client_records(id,workspace_id,user_id,display_name) values('{client}','{workspace}','{user}','Synthetic client');
    set local request.jwt.claims='{{"sub":"{user}","session_id":"{session}","role":"authenticated"}}';
    select public.register_push_device('{device}','ExpoPushToken[synthetic_concurrency_token]','ios','{generation}',repeat('synthetic-secret-',4),1);
    insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status) values('{booking}','{workspace}','{client}',now()+interval '40 days',now()+interval '40 days 1 hour','confirmed');
    insert into public.notifications(workspace_id,recipient_user_id,recipient_role,client_record_id,event_key,kind,target_type,target_id,payload) values('{workspace}','{user}','client','{client}','push-race','booking_confirmed','booking','{booking}','{{"version":1}}');
    commit;""")
    first = connect("begin; select jsonb_array_length(public.claim_push_v1(100)); select pg_sleep(3); commit;")
    count = int(first.stdout.readline().strip())
    application = 'push-claim-' + str(uuid.uuid4())
    second = connect(f"set application_name='{application}'; begin; select jsonb_array_length(public.claim_push_v1(100)); commit;")
    blocked = False
    for _ in range(30):
        if query(f"select count(*) from pg_stat_activity where application_name='{application}' and wait_event_type='Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Competing materialization must observe the first transaction lock'
    _, _ = first.communicate(timeout=15)
    output, _ = second.communicate(timeout=15)
    assert first.returncode == 0 and second.returncode == 0
    assert count == 1 and int(output.strip()) == 0, 'Concurrent claim must preserve one logical send'
    assert query(f"select count(*) from private.push_deliveries d join public.notifications n on n.id=d.notification_id where n.workspace_id='{workspace}';") == '1'
    query(f"update private.push_deliveries set lease_until=clock_timestamp()-interval '1 second' where device_id='{device}'; select public.claim_push_v1(100);")
    assert query(f"select state from private.push_deliveries where device_id='{device}';") == 'unknown', 'Expired send must remain ambiguous without resend'
    identity = f"set local request.jwt.claims='{{\"sub\":\"{user}\",\"session_id\":\"{session}\",\"role\":\"authenticated\"}}';"
    first = connect(f"begin; {identity} select public.unregister_push_device('{device}','{generation}',repeat('synthetic-secret-',4),3); select 'detached'; select pg_sleep(3); commit;")
    while first.stdout.readline().strip() != 'detached':
        assert first.poll() is None, 'Unregister transaction must remain open'
    second = connect(f"begin; {identity} select public.register_push_device('{device}','ExpoPushToken[synthetic_concurrency_token]','ios','{generation}',repeat('synthetic-secret-',4),2); select count(*) from private.push_devices where device_id='{device}'; commit;")
    _, _ = first.communicate(timeout=15)
    output, _ = second.communicate(timeout=15)
    assert first.returncode == 0 and second.returncode == 0
    assert output.strip() == '0', 'Late concurrent register must not resurrect the detached installation'
    print('PASS concurrent logical claim/replay, expired-send ambiguity and device tombstone ordering')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from private.push_devices where device_id='{device}';
      delete from private.push_installations where device_id='{device}';
      delete from public.notifications where workspace_id='{workspace}';
      delete from public.bookings where workspace_id='{workspace}';
      delete from public.client_records where workspace_id='{workspace}';
      delete from public.exercises where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from auth.users where id in ('{owner}','{user}');
      commit;""")
