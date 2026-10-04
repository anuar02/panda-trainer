"""Verify local Auth and account deletion using synthetic users only."""
import argparse
import concurrent.futures
import base64
import hashlib
import hmac
import json
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--workdir', required=True)
parser.add_argument('--container', required=True)
parser.add_argument('--cli', default='app/node_modules/.bin/supabase')
args = parser.parse_args()
status = subprocess.run([args.cli, '--workdir', args.workdir, 'status', '-o', 'json'],
                        capture_output=True, text=True, check=True)
config = json.loads(status.stdout)
api = config['API_URL']
mail = config['MAILPIT_URL']
for address in (api, mail):
    assert urllib.parse.urlparse(address).hostname in ('localhost', '127.0.0.1'), 'Only loopback test services are allowed'
email = f'auth-smoke-{uuid.uuid4()}@example.test'
message_id = None
synthetic_users = []
cleanup_commands = {}


def request(base, path, method='GET', payload=None, token=None):
    headers = {'Content-Type': 'application/json'}
    if base == api:
        headers['apikey'] = config['ANON_KEY']
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(base + path, method=method, headers=headers,
                                 data=None if payload is None else json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw and 'json' in response.headers.get('Content-Type', '') else {}
    except urllib.error.HTTPError as error:
        return error.code, {}


def query(sql):
    result = subprocess.run(
        ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
         '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input=sql, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, 'Local synthetic database assertion failed: ' + result.stderr
    return result.stdout.strip()


def create_session(label):
    address = f'account-delete-{label}-{uuid.uuid4()}@example.test'
    password = str(uuid.uuid4()) + '-Synthetic1!'
    code, user = request(api, '/auth/v1/admin/users', 'POST',
                         {'email': address, 'password': password, 'email_confirm': True},
                         token=config['SERVICE_ROLE_KEY'])
    assert code == 200 and user.get('id'), f'Synthetic Auth creation failed ({code})'
    synthetic_users.append(user['id'])
    code, session = request(api, '/auth/v1/token?grant_type=password', 'POST',
                            {'email': address, 'password': password})
    assert code == 200 and session['user']['id'] == user['id']
    return session


def deletion(payload, token=None):
    return request(api, '/functions/v1/account-deletion', 'POST', payload, token)


def expired_token(token):
    header, body, _ = token.split('.')
    claims = json.loads(base64.urlsafe_b64decode(body + '=' * (-len(body) % 4)))
    claims['exp'] = 1
    encoded = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip('=')
    content = header + '.' + encoded
    signature = hmac.new(config['JWT_SECRET'].encode(), content.encode(), hashlib.sha256).digest()
    return content + '.' + base64.urlsafe_b64encode(signature).decode().rstrip('=')



def prepare_after_inflight_mutation(user_id, request_id, digest):
    application = 'deletion-prepare-' + uuid.uuid4().hex
    claims = json.dumps({'sub': user_id, 'role': 'authenticated'})
    holder = subprocess.Popen(
        ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
         '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        holder.stdin.write(
            f"begin; set local role authenticated; set local request.jwt.claims='{claims}'; "
            f"select public.create_client_record('Synthetic inflight',null,'{uuid.uuid4()}'); "
            "select pg_sleep(2); commit;")
        holder.stdin.close()
        holder.stdin = None
        result = json.loads(holder.stdout.readline())
        assert result.get('id'), 'Inflight write must acquire its mutation lock'
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            prepared = pool.submit(query,
                f"set application_name='{application}'; "
                f"select public.account_deletion_prepare('{request_id}','{user_id}','{digest}');")
            waiting = False
            for _ in range(50):
                if query(f"select count(*) from pg_stat_activity where application_name='{application}' and wait_event_type='Lock';") == '1':
                    waiting = True
                    break
                time.sleep(0.02)
            assert waiting, 'Deletion prepare must wait for an inflight mutation transaction'
            stdout, stderr = holder.communicate(timeout=10)
            assert holder.returncode == 0, 'Synthetic inflight mutation failed: ' + stderr
            response = json.loads(prepared.result(timeout=10).splitlines()[-1])
            assert response['status'] == 'prepared'
    finally:
        if holder.poll() is None:
            holder.kill()
            holder.communicate(timeout=10)


def account_deletion_smoke():
    a, b, client = (create_session(label) for label in ('trainer-a', 'trainer-b', 'client'))
    aid, bid, cid = (session['user']['id'] for session in (a, b, client))
    wa, wb, ca, cb, dual, pa, pb, pd = (str(uuid.uuid4()) for _ in range(8))
    query(f"""
      insert into public.profiles(user_id,display_name) values
        ('{aid}','Synthetic A'),('{bid}','Synthetic B'),('{cid}','Synthetic C');
      insert into public.trainer_workspaces(id,owner_user_id,name) values
        ('{wa}','{aid}','Synthetic A'),('{wb}','{bid}','Synthetic B');
      insert into public.client_records(id,workspace_id,user_id,display_name,phone) values
        ('{ca}','{wa}','{cid}','Synthetic card A','synthetic-phone-a'),
        ('{cb}','{wb}','{cid}','Synthetic card B','synthetic-phone-b'),
        ('{dual}','{wb}','{aid}','Synthetic trainer as client','synthetic-phone-dual');
      insert into public.client_purchases(id,workspace_id,client_record_id,title,units,price_minor,created_by) values
        ('{pa}','{wa}','{ca}','Synthetic A history',4,10000,'{aid}'),
        ('{pb}','{wb}','{cb}','Synthetic B history',4,20000,'{bid}'),
        ('{pd}','{wb}','{dual}','Synthetic dual history',4,30000,'{bid}');
      insert into public.payment_entries(workspace_id,client_record_id,purchase_id,kind,amount_minor,paid_on,method,created_by) values
        ('{wa}','{ca}','{pa}','payment',10000,current_date,'Kaspi','{aid}'),
        ('{wb}','{cb}','{pb}','payment',20000,current_date,'Kaspi','{bid}'),
        ('{wb}','{dual}','{pd}','payment',30000,current_date,'Kaspi','{bid}');
    """)
    preserved = query(f"select jsonb_agg(to_jsonb(p) order by id) from public.payment_entries p where workspace_id='{wb}';")
    for payload in ({'action': 'inspect'}, {'action': 'delete', 'requestId': str(uuid.uuid4()), 'recoveryToken': '1' * 64}):
        code, _ = deletion(payload)
        assert code == 401, 'Anonymous new account deletion must be rejected'
        code, _ = deletion(payload, expired_token(client['access_token']))
        assert code == 401, 'Expired JWT must never authorize a new deletion'
    code, inspected = deletion({'action': 'inspect'}, client['access_token'])
    assert code == 200 and inspected['user_id'] == cid
    assert inspected['foreign_client_card_count'] == 2 and not inspected['has_trainer_workspace']
    client_command = {'action': 'delete', 'requestId': str(uuid.uuid4()), 'recoveryToken': uuid.uuid4().hex + uuid.uuid4().hex}
    cleanup_commands[cid] = client_command
    code, result = deletion(client_command, client['access_token'])
    assert code == 200 and result['status'] == 'complete', 'Client Auth deletion must complete'
    assert query(f"select count(*) from auth.users where id='{cid}';") == '0'
    assert query(f"select count(*) from public.profiles where user_id='{cid}';") == '0'
    assert query(f"select count(*) from public.client_records where id in ('{ca}','{cb}') and user_id is null;") == '2'
    assert query(f"select count(*) from public.client_purchases where id in ('{pa}','{pb}');") == '2'
    assert query(f"select jsonb_agg(to_jsonb(p) order by id) from public.payment_entries p where workspace_id='{wb}';") == preserved
    code, _ = request(api, '/auth/v1/token?grant_type=refresh_token', 'POST', {'refresh_token': client['refresh_token']})
    assert 400 <= code < 500, 'Deleted account session must not refresh'
    code, replay = deletion(client_command)
    assert code == 200 and replay['status'] == 'complete', 'Lost response must recover without deleted Auth'
    code, _ = deletion({**client_command, 'action': 'status', 'recoveryToken': '0' * 64})
    assert code in (401, 403, 404), 'Wrong capability must never recover deletion'
    code, _ = deletion({**client_command, 'action': 'status'}, b['access_token'])
    assert code == 403, 'Foreign authenticated account must not use another deletion receipt'
    code, _ = deletion({**client_command, 'action': 'status'}, expired_token(b['access_token']))
    assert code == 401, 'Expired bearer must be rejected even with a valid recovery capability'

    claims = json.dumps({'sub': aid, 'role': 'authenticated'})
    isolated = subprocess.run(
        ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
         '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
        input=f"begin isolation level repeatable read; set local role authenticated; "
              f"set local request.jwt.claims='{claims}'; "
              f"select public.create_client_record('Must not retain stale fence',null,'{uuid.uuid4()}'); commit;",
        capture_output=True, text=True, timeout=10)
    assert isolated.returncode != 0 and 'account_deletion_requires_read_committed' in isolated.stderr, \
        'Retained-snapshot mutation must fail closed before deletion prepare'

    command = {'action': 'delete', 'requestId': str(uuid.uuid4()), 'recoveryToken': uuid.uuid4().hex + uuid.uuid4().hex}
    cleanup_commands[aid] = command
    digest = hashlib.sha256(command['recoveryToken'].encode()).hexdigest()
    prepare_after_inflight_mutation(aid, command['requestId'], digest)
    assert query(f"select count(*) from auth.users where id='{aid}';") == '1'
    code, _ = request(api, '/rest/v1/rpc/create_client_record', 'POST',
                      {'client_name': 'Must not recreate', 'client_phone': None, 'request_id': str(uuid.uuid4())}, a['access_token'])
    assert 400 <= code < 500, 'Prepared deletion must reject later workspace mutation'
    query(f"select public.account_deletion_execute('{command['requestId']}','{digest}');")
    assert query(f"select count(*) from auth.users where id='{aid}';") == '1', 'Database phase must not claim Auth deletion'
    assert query(f"select count(*) from public.trainer_workspaces where id='{wa}';") == '0'
    assert query(f"select count(*) from public.client_records where id='{dual}' and user_id is null;") == '1'
    assert query(f"select jsonb_agg(to_jsonb(p) order by id) from public.payment_entries p where workspace_id='{wb}';") == preserved
    code, partial = deletion({**command, 'action': 'status'})
    assert code == 200 and partial['status'] == 'database_deleted', 'DB-only result must remain recoverable'
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        replies = list(pool.map(lambda _: deletion(command), range(2)))
    assert all(code == 200 and body['status'] == 'complete' for code, body in replies), 'Concurrent exact recovery must converge'
    assert query(f"select count(*) from auth.users where id='{aid}';") == '0'
    assert query(f"select count(*) from auth.users where id='{bid}';") == '1'
    assert query(f"select count(*) from public.trainer_workspaces where id='{wb}';") == '1'
    assert query(f"select count(*) from public.payment_entries where workspace_id='{wa}';") == '0'
    assert query(f"select jsonb_agg(to_jsonb(p) order by id) from public.payment_entries p where workspace_id='{wb}';") == preserved
    print('PASS: local synthetic client/dual-role deletion, foreign history preservation, Auth refresh rejection, expired/anonymous/foreign guards, DB/Auth recovery and concurrent exact replay')


try:
    code, _ = request(api, '/auth/v1/otp', 'POST', {'email': email, 'create_user': True})
    assert code == 200, f'Local OTP request failed ({code})'
    for _ in range(40):
        code, inbox = request(mail, '/api/v1/messages')
        assert code == 200
        matches = [item for item in inbox['messages']
                   if any(person['Address'] == email for person in item['To'])]
        if matches:
            message_id = matches[0]['ID']
            break
        time.sleep(0.25)
    assert message_id, 'Synthetic email was not captured locally'
    code, message = request(mail, '/api/v1/message/' + message_id)
    assert code == 200
    match = re.search(r'<strong>(\d{6})</strong>', message['HTML'])
    assert match, 'Email template must contain a six-digit code'
    otp = match.group(1)
    wrong = str((int(otp[0]) + 1) % 10) + otp[1:]
    code, _ = request(api, '/auth/v1/verify', 'POST', {'email': email, 'token': wrong, 'type': 'email'})
    assert 400 <= code < 500, 'Wrong email code must be rejected'
    code, session = request(api, '/auth/v1/verify', 'POST', {'email': email, 'token': otp, 'type': 'email'})
    assert code == 200 and session['user']['email'] == email
    assert session['access_token'] and session['refresh_token']
    code, _ = request(api, '/auth/v1/verify', 'POST', {'email': email, 'token': otp, 'type': 'email'})
    assert 400 <= code < 500, 'Consumed email code must not be reused'
    code, refreshed = request(api, '/auth/v1/token?grant_type=refresh_token', 'POST',
                              {'refresh_token': session['refresh_token']})
    assert code == 200 and refreshed['user']['id'] == session['user']['id']
    code, _ = request(api, '/auth/v1/logout?scope=local', 'POST', token=refreshed['access_token'])
    assert code == 204, f'Local logout failed ({code})'
    code, _ = request(api, '/auth/v1/token?grant_type=refresh_token', 'POST',
                      {'refresh_token': refreshed['refresh_token']})
    assert 400 <= code < 500, 'Logged-out session must not refresh'
    print('PASS: captured email OTP, wrong/reused code rejection, session refresh and local logout')
    account_deletion_smoke()
finally:
    for user_id in synthetic_users:
        if query(f"select count(*) from auth.users where id='{user_id}';") == '0':
            continue
        cleanup_command = cleanup_commands.get(user_id, {
            'requestId': str(uuid.uuid4()), 'recoveryToken': uuid.uuid4().hex + uuid.uuid4().hex})
        cleanup_id = cleanup_command['requestId']
        cleanup_hash = hashlib.sha256(cleanup_command['recoveryToken'].encode()).hexdigest()
        query(f"select public.account_deletion_prepare('{cleanup_id}','{user_id}','{cleanup_hash}'); "
              f"select public.account_deletion_execute('{cleanup_id}','{cleanup_hash}'); "
              f"delete from auth.users where id='{user_id}'; "
              f"select public.account_deletion_complete('{cleanup_id}','{cleanup_hash}');")
    subprocess.run(['docker', 'exec', args.container, 'psql', '-X', '-qAt', '-U', 'postgres',
                    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
                    f"delete from auth.users where email = '{email}';"],
                   capture_output=True, text=True, check=True, timeout=10)
    if message_id:
        code, _ = request(mail, '/api/v1/messages', 'DELETE', {'IDs': [message_id]})
        assert code in (200, 204), 'Synthetic mail cleanup failed'
