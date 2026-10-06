"""Exercise payment serialization, overpayment rejection and immutable retries."""
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
    result = subprocess.run(command, input="set statement_timeout = '10s'; " + sql,
                            text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def identity():
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}'; ")


def result_from(output):
    return next(json.loads(line) for line in output.splitlines() if line.startswith('{'))


def invoke(sql):
    return result_from(query('begin; ' + identity() + sql + ' commit;'))


def connect(sql):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    processes.append(process)
    process.stdin.write(sql)
    process.stdin.close()
    process.stdin = None
    return process


def race(first_sql, second_sql, second_error_code=None):
    first = connect('begin; ' + identity() + first_sql + ' select pg_sleep(2); commit;')
    first_result = result_from(first.stdout.readline())
    assert first.poll() is None, 'First command must retain its workspace lock'
    application = 'payment-race-' + str(uuid.uuid4())
    second = connect("\\set VERBOSITY sqlstate\n" + f"set application_name = '{application}'; begin; " +
                     identity() + second_sql + ' commit;')
    blocked = False
    for _ in range(30):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Competing command must wait on the workspace lock'
    _, first_error = first.communicate(timeout=15)
    second_output, second_error = second.communicate(timeout=15)
    assert first.returncode == 0, first_error
    if second_error_code:
        assert second.returncode != 0 and second_error_code in second_error, second_error
        return first_result, None
    assert second.returncode == 0, second_error
    return first_result, result_from(second_output)


def purchase():
    return invoke(f"select public.create_client_purchase('{client}','Payment race',10,10000,'{uuid.uuid4()}');")['purchase_id']


def payment_sql(purchase_id, amount, request_id=None):
    return (f"select public.record_client_payment('{purchase_id}',{amount},'2026-10-03',"
            f"'Kaspi','{request_id or uuid.uuid4()}');")


def reversal_sql(payment, request_id=None):
    return (f"select public.reverse_client_payment('{payment['payment_entry_id']}',"
            f"'Concurrent correction','{request_id or uuid.uuid4()}');")


def paid(purchase_id):
    return int(query(f"select coalesce(sum(amount_minor),0) from public.payment_entries where purchase_id='{purchase_id}';"))


def entry_count(purchase_id):
    return int(query(f"select count(*) from public.payment_entries where purchase_id='{purchase_id}';"))


try:
    query(f"""begin;
      insert into auth.users(id,aud,role,email) values
        ('{owner}','authenticated','authenticated','{owner}@example.test'),
        ('{member}','authenticated','authenticated','{member}@example.test');
      insert into public.trainer_workspaces(id,owner_user_id,name)
        values('{workspace}','{owner}','Payment concurrency fixture');
      insert into public.client_records(id,workspace_id,user_id,display_name)
        values('{client}','{workspace}','{member}','Payment concurrency member');
      commit;""")

    competing = purchase()
    accepted, _ = race(payment_sql(competing,6000),payment_sql(competing,6000),'P0003')
    assert accepted['paid_minor'] == '6000' and accepted['due_minor'] == '4000'
    assert paid(competing) == 6000 and entry_count(competing) == 1
    print('PASS: competing payments cannot overdraw exact purchase debt')

    identical = purchase()
    command_sql = payment_sql(identical,4000,str(uuid.uuid4()))
    first, replay = race(command_sql,command_sql)
    assert not first['replayed'] and replay['replayed']
    assert first['payment_entry_id'] == replay['payment_entry_id']
    assert paid(identical) == 4000 and entry_count(identical) == 1
    print('PASS: concurrent same request records one payment and replays one receipt')

    corrected, _ = race(reversal_sql(first),reversal_sql(first),'55000')
    assert corrected['amount_minor'] == '-4000'
    assert paid(identical) == 0 and entry_count(identical) == 2
    print('PASS: competing reversals append one exact correction')

    reversal_first = purchase()
    original = invoke(payment_sql(reversal_first,10000))
    corrected, replacement = race(reversal_sql(original),payment_sql(reversal_first,10000))
    assert corrected['due_minor'] == '10000' and replacement['due_minor'] == '0'
    assert paid(reversal_first) == 10000 and entry_count(reversal_first) == 3
    print('PASS: payment after locked reversal uses restored debt')

    payment_first = purchase()
    original = invoke(payment_sql(payment_first,6000))
    remainder, corrected = race(payment_sql(payment_first,4000),reversal_sql(original))
    assert remainder['due_minor'] == '0' and corrected['due_minor'] == '6000'
    assert paid(payment_first) == 4000 and entry_count(payment_first) == 3
    assert query(f"select count(*) from public.credit_entries where workspace_id='{workspace}' and kind<>'grant';") == '0'
    assert query(f"select count(*) from public.client_purchases p where p.workspace_id='{workspace}' and (select sum(units) from public.credit_entries e where e.purchase_id=p.id)<>p.units;") == '0'
    print('PASS: correction after locked payment preserves exact net balance and session units')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      set local session_replication_role = replica;
      delete from private.billing_command_receipts where workspace_id='{workspace}';
      delete from public.payment_entries where workspace_id='{workspace}';
      delete from public.credit_entries where workspace_id='{workspace}';
      delete from public.client_purchases where workspace_id='{workspace}';
      delete from public.client_records where workspace_id='{workspace}';
      delete from public.exercises where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from auth.users where id in ('{owner}','{member}');
      commit;""")
