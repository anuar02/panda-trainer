"""Verify email OTP, session refresh and logout using only local mail capture."""
import argparse
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
finally:
    subprocess.run(['docker', 'exec', args.container, 'psql', '-X', '-qAt', '-U', 'postgres',
                    '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
                    f"delete from auth.users where email = '{email}';"],
                   capture_output=True, text=True, check=True, timeout=10)
    if message_id:
        code, _ = request(mail, '/api/v1/messages', 'DELETE', {'IDs': [message_id]})
        assert code in (200, 204), 'Synthetic mail cleanup failed'
