"""Exercise attendance credits with concurrent transactions and exact retries."""
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


def identity(actor=owner):
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{actor}\",\"role\":\"authenticated\"}}'; ")


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
    application = 'attendance-race-' + str(uuid.uuid4())
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


def booking():
    booking_id = str(uuid.uuid4())
    query(f"""insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status)
      values('{booking_id}','{workspace}','{client}',now()-interval '1 day',
             now()-interval '23 hours','confirmed');""")
    return booking_id


def purchase_sql(units=1, request_id=None):
    return (f"select public.create_client_purchase('{client}','Concurrent package',{units},10000,"
            f"'{request_id or uuid.uuid4()}');")


def mark_sql(booking_id, charge=True, purchase_id=None, request_id=None):
    selected = f"'{purchase_id}'" if purchase_id else 'null'
    return (f"select public.mark_attended('{booking_id}',1,'{request_id or uuid.uuid4()}',"
            f"{str(charge).lower()},{selected});")


def bind_sql(attendance, purchase_id, request_id=None):
    return (f"select public.bind_attendance_purchase('{attendance['attendance_id']}',"
            f"{attendance['revision']},1,'{request_id or uuid.uuid4()}','{purchase_id}');")


def undo_sql(attendance, request_id=None):
    return (f"select public.undo_attendance('{attendance['attendance_id']}',"
            f"{attendance['revision']},1,'Concurrent correction','{request_id or uuid.uuid4()}');")


def balance(purchase_id):
    return int(query(f"select coalesce(sum(units),0) from public.credit_entries where purchase_id='{purchase_id}';"))


def entries(attendance_id, kind):
    return int(query(f"select count(*) from public.credit_entries where attendance_id='{attendance_id}' and kind='{kind}';"))


try:
    query(f"""begin;
      insert into auth.users(id,aud,role,email) values
        ('{owner}','authenticated','authenticated','{owner}@example.test'),
        ('{member}','authenticated','authenticated','{member}@example.test');
      insert into public.trainer_workspaces(id,owner_user_id,name)
        values('{workspace}','{owner}','Attendance concurrency fixture');
      insert into public.client_records(id,workspace_id,user_id,display_name)
        values('{client}','{workspace}','{member}','Attendance concurrency member');
      commit;""")

    creation = purchase_sql(request_id=str(uuid.uuid4()))
    first, retry = race(creation, creation)
    assert retry['replayed'] and first['purchase_id'] == retry['purchase_id']
    assert balance(first['purchase_id']) == 1
    assert query(f"select count(*) from public.credit_entries where purchase_id='{first['purchase_id']}' and kind='grant';") == '1'
    print('PASS: concurrent identical purchase retry grants once')

    first_booking, second_booking = booking(), booking()
    marked, unbound = race(mark_sql(first_booking), mark_sql(second_booking))
    assert marked['charged'] and not unbound['charged']
    assert unbound['purchase_id'] is None and unbound['status'] == 'present'
    assert balance(first['purchase_id']) == 0
    print('PASS: competing bookings consume the final unit once and preserve unbound presence')

    package = invoke(purchase_sql(2))
    duplicate_booking = booking()
    duplicate_command = mark_sql(duplicate_booking, purchase_id=package['purchase_id'])
    marked, _ = race(duplicate_command, mark_sql(duplicate_booking, purchase_id=package['purchase_id']), '55000')
    assert entries(marked['attendance_id'], 'consume') == 1 and balance(package['purchase_id']) == 1
    print('PASS: different request IDs cannot duplicate attendance consumption')

    bind_booking = booking()
    presence_command = mark_sql(bind_booking, charge=False)
    presence = invoke(presence_command)
    bound, _ = race(bind_sql(presence, package['purchase_id']),
                    bind_sql(presence, package['purchase_id']), '40001')
    assert bound['charged'] and entries(bound['attendance_id'], 'consume') == 1
    assert balance(package['purchase_id']) == 0
    print('PASS: competing later bindings consume one unit')

    undo_command = undo_sql(bound)
    undone, _ = race(undo_command, undo_sql(bound), '40001')
    assert undone['status'] == 'undone' and entries(bound['attendance_id'], 'restore') == 1
    assert balance(package['purchase_id']) == 1
    print('PASS: competing attendance corrections restore one unit')

    new_cycle = invoke(mark_sql(bind_booking, purchase_id=package['purchase_id']))
    assert new_cycle['cycle'] == bound['cycle'] + 1
    assert new_cycle['revision'] > undone['revision']
    replay_undo = invoke(undo_command)
    assert replay_undo['replayed'] and replay_undo['revision'] == undone['revision']
    assert replay_undo['cycle'] == undone['cycle']
    replay_mark = invoke(presence_command)
    assert replay_mark['replayed'] and replay_mark['revision'] == presence['revision']
    assert replay_mark['cycle'] == presence['cycle'] and not replay_mark['charged']
    assert entries(bound['attendance_id'], 'consume') == 2
    assert entries(bound['attendance_id'], 'restore') == 1
    assert balance(package['purchase_id']) == 0
    assert query(f"select status||'|'||cycle::text from public.attendance_records where id='{bound['attendance_id']}';") == f"present|{new_cycle['cycle']}"
    print('PASS: historical mark and undo receipts do not mutate a newer attendance cycle')
    for actor, label in ((member, 'client'), (owner, 'trainer')):
        cancelled_booking = booking()
        cancel_sql = f"select public.cancel_booking('{cancelled_booking}',1,'{uuid.uuid4()}');"
        cancelled = result_from(query('begin; ' + identity(actor) + cancel_sql + ' commit;'))
        assert cancelled['status'] == 'cancelled_by_' + label and cancelled['revision'] == 2
        assert query(f"select count(*) from public.credit_entries where booking_id='{cancelled_booking}';") == '0'
        cancellation_package = invoke(purchase_sql())
        penalty_request = str(uuid.uuid4())

        def penalty(request_id):
            return (f"select public.charge_late_cancellation('{cancelled_booking}',2,"
                    f"'Synthetic {label} late cancellation','{request_id}',"
                    f"'{cancellation_package['purchase_id']}');")

        charged, replay = race(penalty(penalty_request), penalty(penalty_request))
        assert charged['charged'] and replay['replayed']
        assert charged['credit_entry_id'] == replay['credit_entry_id']
        assert balance(cancellation_package['purchase_id']) == 0
        race(penalty(penalty_request), penalty(str(uuid.uuid4())), '55000')
        assert query(f"select count(*) from public.credit_entries where booking_id='{cancelled_booking}' and kind='charge_late_cancel';") == '1'
        assert query(f"select count(*) from public.attendance_records where booking_id='{cancelled_booking}';") == '0'
        assert query(f"select revision from public.bookings where id='{cancelled_booking}';") == '2'
        print(f'PASS: {label} cancellation has no automatic debit; concurrent explicit penalty retries charge once')

finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      set local session_replication_role = replica;
      delete from private.booking_status_command_receipts where workspace_id='{workspace}';
      delete from private.billing_command_receipts where workspace_id='{workspace}';
      delete from public.credit_entries where workspace_id='{workspace}';
      delete from public.attendance_revisions where workspace_id='{workspace}';
      delete from public.attendance_records where workspace_id='{workspace}';
      delete from public.client_purchases where workspace_id='{workspace}';
      delete from public.bookings where workspace_id='{workspace}';
      delete from public.client_records where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from auth.users where id in ('{owner}','{member}');
      commit;""")
