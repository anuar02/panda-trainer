"""Verify invitation acceptance and replacement serialize across real connections."""
import argparse
import json
import secrets
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
           '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
trainer, workspace, acceptor_a, acceptor_b = (str(uuid.uuid4()) for _ in range(4))
clients = [str(uuid.uuid4()) for _ in range(4)]
tokens = [secrets.token_urlsafe(32) for _ in range(5)]
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


def identity(user_id):
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{user_id}\",\"role\":\"authenticated\"}}'; ")


def issue(client_id, token, request_id=None):
    request_id = request_id or str(uuid.uuid4())
    output = query('begin; ' + identity(trainer) +
                   f"select public.issue_client_invitation('{client_id}', '{token}', '{request_id}'); commit;")
    return result_from(output)


def assert_lock_wait(application):
    blocked = False
    for _ in range(100):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second invitation operation must wait for the first row lock'


def race_acceptors(client_id, token):
    first = connect('begin; ' + identity(acceptor_a) +
                    f"select public.accept_invitation('{token}'); select pg_sleep(2); commit;")
    first_result = result_from(first.stdout.readline())
    assert first_result['accepted'] and not first_result['replayed']
    assert first.poll() is None, 'First acceptor must still hold the client and invitation locks'

    application = 'invitation-accept-race-' + str(uuid.uuid4())
    second = connect("\\set VERBOSITY sqlstate\n" +
                     f"set application_name = '{application}'; begin; " + identity(acceptor_b) +
                     f"select public.accept_invitation('{token}'); commit;")
    assert_lock_wait(application)
    first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first.stderr.read() if first.stderr else 'first accept failed'
    assert second.returncode != 0 and 'P0002' in second_error, (second_output, second_error)
    assert query(f"select user_id::text from public.client_records where id = '{client_id}';") == acceptor_a
    assert query(f"select count(*) from public.invitations where client_record_id = '{client_id}' and accepted_by = '{acceptor_a}';") == '1'
    print('PASS: concurrent acceptors produce one claim; the other receives the neutral unavailable error')


def race_reissue_wins(client_id, old_token, replacement_token):
    application = 'invitation-reissue-race-' + str(uuid.uuid4())
    replacement_request = str(uuid.uuid4())
    reissue = connect(f"set application_name = '{application}'; begin; " + identity(trainer) +
                      f"select public.issue_client_invitation('{client_id}', '{replacement_token}', '{replacement_request}'); "
                      'select pg_sleep(2); commit;')
    replacement_result = result_from(reissue.stdout.readline())
    assert not replacement_result['replayed'] and reissue.poll() is None

    accept = connect("\\set VERBOSITY sqlstate\n" + 'begin; ' + identity(acceptor_a) +
                     f"select public.accept_invitation('{old_token}'); commit;")
    blocked = False
    for _ in range(100):
        if query(f"select count(*) from pg_stat_activity where pid <> pg_backend_pid() "
                 f"and application_name = '{application}' and wait_event_type = 'Lock';") == '1':
            # The issue transaction is holding the row locks while pg_sleep runs.
            time.sleep(0.05)
        if query(f"select count(*) from pg_stat_activity where pid <> pg_backend_pid() "
                 "and wait_event_type = 'Lock' and query like '%accept_invitation%';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Acceptance must wait while a replacement link is committed'
    reissue.communicate(timeout=10)
    accept_output, accept_error = accept.communicate(timeout=10)
    assert reissue.returncode == 0, reissue.stderr.read() if reissue.stderr else 'replacement issue failed'
    assert accept.returncode != 0 and 'P0002' in accept_error, (accept_output, accept_error)
    assert query(f"select count(*) from public.invitations where client_record_id = '{client_id}' and revoked_at is not null and accepted_at is null;") == '1'
    assert query(f"select token_hash = encode(extensions.digest(convert_to('{replacement_token}', 'UTF8'), 'sha256'), 'hex') and revoked_at is null from public.invitations where id = '{replacement_result['invitation_id']}';") == 't'
    assert query(f"select user_id is null from public.client_records where id = '{client_id}';") == 't'
    print('PASS: replacement wins the race, revokes the older link, and prevents its acceptance')


def race_accept_wins(client_id, token, replacement_token):
    first = connect('begin; ' + identity(acceptor_a) +
                    f"select public.accept_invitation('{token}'); select pg_sleep(2); commit;")
    first_result = result_from(first.stdout.readline())
    assert first_result['accepted'] and first.poll() is None

    application = 'invitation-accept-reissue-' + str(uuid.uuid4())
    reissue = connect("\\set VERBOSITY sqlstate\n" +
                      f"set application_name = '{application}'; begin; " + identity(trainer) +
                      f"select public.issue_client_invitation('{client_id}', '{replacement_token}', '{uuid.uuid4()}'); commit;")
    assert_lock_wait(application)
    first.communicate(timeout=10)
    reissue_output, reissue_error = reissue.communicate(timeout=10)
    assert first.returncode == 0
    assert reissue.returncode != 0 and 'P0002' in reissue_error, (reissue_output, reissue_error)
    assert query(f"select user_id::text from public.client_records where id = '{client_id}';") == acceptor_a
    assert query(f"select count(*) from public.invitations where client_record_id = '{client_id}' and accepted_by = '{acceptor_a}' and revoked_at is null;") == '1'
    print('PASS: acceptance wins the race; later reissue cannot replace a claimed client card')


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values
          ('{trainer}', 'authenticated', 'authenticated', '{trainer}@example.test'),
          ('{acceptor_a}', 'authenticated', 'authenticated', '{acceptor_a}@example.test'),
          ('{acceptor_b}', 'authenticated', 'authenticated', '{acceptor_b}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{trainer}', 'Invitation concurrency fixture');
      insert into public.client_records (id, workspace_id, display_name)
        values
          ('{clients[0]}', '{workspace}', 'Competing acceptors'),
          ('{clients[1]}', '{workspace}', 'Replacement wins'),
          ('{clients[2]}', '{workspace}', 'Acceptance wins');
      commit;""")
    issue(clients[0], tokens[0])
    race_acceptors(clients[0], tokens[0])
    issue(clients[1], tokens[1])
    race_reissue_wins(clients[1], tokens[1], tokens[2])
    issue(clients[2], tokens[3])
    race_accept_wins(clients[2], tokens[3], tokens[4])
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from private.client_invitation_receipts where workspace_id = '{workspace}';
      delete from public.client_records where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from auth.users where id in ('{trainer}', '{acceptor_a}', '{acceptor_b}');
      commit;""")
