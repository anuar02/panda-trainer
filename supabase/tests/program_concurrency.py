"""Verify that simultaneous assignment retries create one program snapshot."""
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
owner, workspace, client, request_id = (str(uuid.uuid4()) for _ in range(4))
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


def identity():
    return ("set local statement_timeout = '10s'; set local role authenticated; "
            f"set local request.jwt.claims = '{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}'; ")


try:
    query(f"""begin;
      insert into auth.users (id, aud, role, email)
        values ('{owner}', 'authenticated', 'authenticated', '{owner}@example.test');
      insert into public.trainer_workspaces (id, owner_user_id, name)
        values ('{workspace}', '{owner}', 'Program concurrency fixture');
      insert into public.client_records (id, workspace_id, display_name)
        values ('{client}', '{workspace}', 'Program concurrency client');
      commit;""")
    exercise = query(f"select id from public.exercises where workspace_id = '{workspace}' and source_key = 'e0';")
    payload = json.dumps([{'exercise_id': exercise, 'planned_sets': 3, 'planned_reps': '8'}])
    initial = result_from(query('begin; ' + identity() +
        f"select public.save_workout_template(null, null, 'Program source', '', '{payload}'::jsonb, '{uuid.uuid4()}'); commit;"))
    assignment = (f"select public.assign_client_program('{client}', '{initial['id']}', "
                  f"{initial['revision']}, '{request_id}');")
    first = connect('begin; ' + identity() + assignment + ' select pg_sleep(3); commit;')
    first_result = result_from(first.stdout.readline())
    assert not first_result['replayed']
    assert first.poll() is None, 'First assignment must still hold its workspace lock'
    application = 'program-race-' + str(uuid.uuid4())
    second = connect(f"set application_name = '{application}'; begin; " + identity() + assignment + ' commit;')
    blocked = False
    for _ in range(20):
        if query(f"select count(*) from pg_stat_activity where application_name = '{application}' "
                 "and wait_event_type = 'Lock';") == '1':
            blocked = True
            break
        time.sleep(0.05)
    assert blocked, 'Second assignment must wait on the same workspace lock'
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    assert second.returncode == 0, second_error
    second_result = result_from(second_output)
    assert second_result['replayed']
    assert second_result['id'] == first_result['id']
    assert second_result['revision'] == first_result['revision']
    assert query(f"select count(*) from public.client_programs where workspace_id = '{workspace}';") == '1'
    assert query(f"select count(*) from public.client_program_exercises where workspace_id = '{workspace}';") == '1'
    print('PASS: concurrent assignment retries create one complete program snapshot')
    booking, workout, workout_exercise, set_id, device = (str(uuid.uuid4()) for _ in range(5))
    query(f"""begin;
      insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status)
      values('{booking}','{workspace}','{client}',now()+interval '190 days',now()+interval '190 days 1 hour','confirmed');
      insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,source_program_id,source_program_revision,finished_at)
      values('{workout}','{workspace}','{booking}','{client}','{first_result['id']}',1,now());
      insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps)
      select '{workout_exercise}',workspace_id,'{workout}',exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,0,planned_sets,planned_reps
      from public.client_program_exercises where client_program_id='{first_result['id']}';
      insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id)
      values('{set_id}','{workspace}','{workout}','{workout_exercise}',0,10,10000,'{owner}','{device}');
      commit;""")

    def update_sql(source, revision, request):
        return (f"select public.update_client_program('{owner}','{workspace}','{client}','{workout}',"
                f"'{source}',1,{revision},array['values:{workout_exercise}'],'{request}');")

    def blocked_race(first_sql, second_sql, second_ok=True, early_second=False):
        application = 'program-update-race-' + str(uuid.uuid4())
        if early_second:
            waiting = connect(f"set application_name='{application}'; begin; " + identity() +
                              " select jsonb_build_object('transaction_started',true); select pg_sleep(1); " + second_sql + ' commit;')
            assert result_from(waiting.stdout.readline())['transaction_started']
        holding = connect('begin; ' + identity() + first_sql + ' select pg_sleep(3); commit;')
        value = result_from(holding.stdout.readline())
        if not early_second:
            waiting = connect(f"set application_name='{application}'; begin; " + identity() + second_sql + ' commit;')
        for _ in range(30):
            if query(f"select count(*) from pg_stat_activity where application_name='{application}' and wait_event_type='Lock';") == '1':
                break
            time.sleep(0.05)
        else:
            raise AssertionError('Program update must block on the shared assignment/correction lock')
        _, error = holding.communicate(timeout=10)
        output, waiting_error = waiting.communicate(timeout=10)
        assert holding.returncode == 0, error
        assert (waiting.returncode == 0) == second_ok, waiting_error or output
        return value, output, waiting_error

    update_request = str(uuid.uuid4())
    update = update_sql(first_result['id'], 1, update_request)
    created, replay_output, _ = blocked_race(update, update)
    assert result_from(replay_output) == created, 'Update exact replay must return the identical receipt'
    assert query(f"select count(*) from public.client_programs where workspace_id='{workspace}';") == '2'
    assert query(f"select planned_reps from public.client_program_exercises where client_program_id='{first_result['id']}';") == '8'
    print('PASS: two-session exact program update replay preserves immutable history')

    # A correction holds the journal advisory lock; an already reviewed update becomes stale.
    query(f"update public.set_results set reps=11 where id='{set_id}';")
    note_id = str(uuid.uuid4())
    op = dict(operation_id=str(uuid.uuid4()), kind='set_note', entity_id=note_id, base_revision=0,
              device_id=device, created_at='2026-10-04T12:00:00Z',
              payload=dict(workout_instance_id=workout, text='Synthetic program race correction', shared=False))
    encoded = json.dumps([op]).replace("'", "''")
    draft = result_from(query('begin; ' + identity() + f"select public.apply_operations('{workspace}','{encoded}'::jsonb); commit;"))['results'][0]['draft_id']
    review = result_from(query('begin; ' + identity() + f"select public.get_workout_correction('{owner}','{workspace}','{workout}','{draft}'); commit;"))
    correction = (f"select public.apply_workout_correction('{owner}','{workspace}','{workout}','{draft}',"
                  f"'{uuid.uuid4()}',{review['workout_revision']},0,null);")
    _, _, failure = blocked_race(correction, update_sql(created['program_id'], review['workout_revision'], str(uuid.uuid4())), False)
    assert 'stale_source' in failure, failure
    assert query(f"select count(*) from public.client_programs where workspace_id='{workspace}';") == '2'
    print('PASS: correction/update race rejects stale journal without a partial copy')

    # Assignment commits a different current source while an update is waiting.
    fresh_assignment = (f"select public.assign_client_program('{client}','{initial['id']}',"
                        f"{initial['revision']},'{uuid.uuid4()}');")
    revision = query(f"select revision from public.workout_instances where id='{workout}';")
    assigned, _, failure = blocked_race(fresh_assignment, update_sql(created['program_id'], revision, str(uuid.uuid4())), False)
    assert 'assignment_changed' in failure, failure
    assert query(f"select count(*) from public.client_programs where workspace_id='{workspace}';") == '3'
    assert query(f"select id from public.client_programs where workspace_id='{workspace}' order by created_at desc,id desc limit 1;") == assigned['id']
    print('PASS: assignment/update race preserves the newer assignment')

    # The opposite lock order outcome: update commits, then a waiting assignment must become current.
    booking, workout, workout_exercise, set_id = (str(uuid.uuid4()) for _ in range(4))
    query(f"""begin;
      insert into public.bookings(id,workspace_id,client_record_id,starts_at,ends_at,status)
      values('{booking}','{workspace}','{client}',now()+interval '191 days',now()+interval '191 days 1 hour','confirmed');
      insert into public.workout_instances(id,workspace_id,booking_id,client_record_id,source_program_id,source_program_revision,finished_at)
      values('{workout}','{workspace}','{booking}','{client}','{assigned['id']}',1,now());
      insert into public.workout_exercises(id,workspace_id,workout_instance_id,exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,position,planned_sets,planned_reps)
      select '{workout_exercise}',workspace_id,'{workout}',exercise_id,exercise_name_snapshot,measure_snapshot,bodyweight_snapshot,muscle_group_snapshot,equipment_snapshot,instructions_snapshot,0,planned_sets,planned_reps
      from public.client_program_exercises where client_program_id='{assigned['id']}';
      insert into public.set_results(id,workspace_id,workout_instance_id,workout_exercise_id,position,reps,weight_g,author_user_id,device_id)
      values('{set_id}','{workspace}','{workout}','{workout_exercise}',0,12,12000,'{owner}','{device}');
      commit;""")
    fresh_assignment = (f"select public.assign_client_program('{client}','{initial['id']}',"
                        f"{initial['revision']},'{uuid.uuid4()}');")
    updated, assigned_output, _ = blocked_race(update_sql(assigned['id'],1,str(uuid.uuid4())),fresh_assignment,early_second=True)
    latest_assignment = result_from(assigned_output)
    assert query(f"select id from public.client_programs where workspace_id='{workspace}' order by created_at desc,id desc limit 1;") == latest_assignment['id']
    assert query(f"select (updated_at < (select created_at from public.client_programs where id='{updated['program_id']}'))::text from public.client_programs where id='{latest_assignment['id']}';") == 'true', 'Assignment transaction must actually predate the update copy'
    print('PASS: waiting assignment begun before program update becomes current by lock-ordered creation time')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      set local session_replication_role=replica;
      delete from private.program_update_receipts where workspace_id = '{workspace}';
      delete from private.workout_correction_audit where workspace_id = '{workspace}';
      delete from private.workout_correction_receipts where workspace_id = '{workspace}';
      delete from public.workout_correction_drafts where workspace_id = '{workspace}';
      delete from public.sync_operations where workspace_id = '{workspace}';
      delete from public.session_notes where workspace_id = '{workspace}';
      delete from public.private_notes where workspace_id = '{workspace}';
      delete from public.set_results where workspace_id = '{workspace}';
      delete from public.workout_exercises where workspace_id = '{workspace}';
      delete from public.workout_instances where workspace_id = '{workspace}';
      delete from public.bookings where workspace_id = '{workspace}';
      delete from public.client_program_exercises where workspace_id = '{workspace}';
      delete from public.client_programs where workspace_id = '{workspace}';
      delete from private.program_assignment_receipts where workspace_id = '{workspace}';
      delete from public.template_exercises where workspace_id = '{workspace}';
      delete from public.workout_templates where workspace_id = '{workspace}';
      delete from private.template_command_receipts where workspace_id = '{workspace}';
      delete from public.client_records where workspace_id = '{workspace}';
      delete from public.exercises where workspace_id = '{workspace}';
      delete from public.trainer_workspaces where id = '{workspace}';
      delete from public.profiles where user_id = '{owner}';
      delete from auth.users where id = '{owner}';
      commit;""")
