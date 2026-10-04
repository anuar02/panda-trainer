"""Exercise replay identity and conditional archive across real connections."""
import argparse
import subprocess
import time
import uuid

parser = argparse.ArgumentParser()
parser.add_argument('--container', required=True)
args = parser.parse_args()
command = ['docker', 'exec', '-i', args.container, 'psql', '-X', '-qAt',
           '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner, workspace, exercise = (str(uuid.uuid4()) for _ in range(3))
processes = []


def query(sql):
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr or result.stdout)
    return result.stdout.strip()


def connect(sql):
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True)
    processes.append(process)
    process.stdin.write(sql)
    process.stdin.close()
    process.stdin = None
    return process


def identity():
    return ("set local statement_timeout='10s'; set local role authenticated; "
            f"set local request.jwt.claims='{{\"sub\":\"{owner}\",\"role\":\"authenticated\"}}'; ")


def insert(exercise_id, name):
    return ("insert into public.exercises(id,workspace_id,name,muscle_group,equipment,measure,bodyweight) "
            f"values('{exercise_id}','{workspace}','{name}','Грудь','штанга','reps',false) returning id; ")


def wait_blocked(application):
    for _ in range(40):
        if query(f"select count(*) from pg_stat_activity where application_name='{application}' "
                 "and wait_event_type='Lock';") == '1':
            return
        time.sleep(0.05)
    raise AssertionError('Concurrent command must wait on the first transaction')


try:
    query(f"""begin;
      insert into auth.users(id,aud,role,email) values('{owner}','authenticated','authenticated','{owner}@example.test');
      insert into public.trainer_workspaces(id,owner_user_id,name) values('{workspace}','{owner}','SOM22 concurrency fixture');
      commit;""")
    for same_uuid in (True, False):
        exercise = str(uuid.uuid4())
        name = 'Concurrent Ёлка' if same_uuid else 'Second Ёлка'
        first = connect('begin; ' + identity() + insert(exercise, name) + 'select pg_sleep(3); commit;')
        assert first.stdout.readline().strip() == exercise
        assert first.poll() is None
        application = 'som22-insert-' + str(uuid.uuid4())
        second = connect("\\set VERBOSITY sqlstate\n" + f"set application_name='{application}'; begin; " +
                         identity() + insert(exercise if same_uuid else str(uuid.uuid4()), name.lower().replace('ё', 'е')) + 'commit;')
        wait_blocked(application)
        _, first_error = first.communicate(timeout=10)
        _, second_error = second.communicate(timeout=10)
        assert first.returncode == 0, first_error
        assert second.returncode != 0 and '23505' in second_error, second_error
        assert query(f"select count(*) from public.exercises where workspace_id='{workspace}' "
                     f"and name_normalized=public.normalize_library_name('{name}');") == '1'
        assert query(f"select id from public.exercises where workspace_id='{workspace}' "
                     f"and name_normalized=public.normalize_library_name('{name}');") == exercise
        print('PASS: concurrent durable UUID/normalized-name insert creates one original row')
    update = (f"update public.exercises set archived_at='2026-10-04T10:00:00Z' where workspace_id='{workspace}' "
              f"and id='{exercise}' and archived_at is null returning revision; ")
    first = connect('begin; ' + identity() + update + 'select pg_sleep(3); commit;')
    assert first.stdout.readline().strip() == '2'
    application = 'som22-archive-' + str(uuid.uuid4())
    second = connect(f"set application_name='{application}'; begin; " + identity() + update + 'commit;')
    wait_blocked(application)
    _, first_error = first.communicate(timeout=10)
    second_output, second_error = second.communicate(timeout=10)
    assert first.returncode == 0, first_error
    assert second.returncode == 0, second_error
    assert not second_output.strip(), second_output
    assert query(f"select revision from public.exercises where id='{exercise}';") == '2'
    assert query(f"select archived_at='2026-10-04T10:00:00Z'::timestamptz from public.exercises where id='{exercise}';") == 't'
    replay = connect("\\set VERBOSITY sqlstate\n" + 'begin; ' + identity() + insert(exercise, 'After archive') + 'commit;')
    _, replay_error = replay.communicate(timeout=10)
    assert replay.returncode != 0 and '23505' in replay_error, replay_error
    print('PASS: concurrent conditional archive increments once; UUID replay cannot duplicate archived row')
finally:
    for process in processes:
        if process.poll() is None:
            process.kill()
            process.communicate()
    query(f"""begin;
      delete from public.exercises where workspace_id='{workspace}';
      delete from public.trainer_workspaces where id='{workspace}';
      delete from auth.users where id='{owner}';
      commit;""")
