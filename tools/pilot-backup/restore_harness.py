#!/usr/bin/env python3
"""Independent synthetic PostgreSQL dump/encrypt/restore drill; never pilot data."""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

import backup

FIXTURES = Path(__file__).parent / 'fixtures'
ROLE_SQL = """
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'som40_fixture_reader') THEN
    CREATE ROLE som40_fixture_reader NOLOGIN NOSUPERUSER NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'som40_fixture_reader'
      AND (rolsuper OR rolbypassrls OR rolcanlogin)) THEN
    RAISE EXCEPTION 'unsafe fixture role attributes';
  END IF;
  IF EXISTS (SELECT FROM pg_auth_members
      WHERE member = (SELECT oid FROM pg_roles WHERE rolname = 'som40_fixture_reader')) THEN
    RAISE EXCEPTION 'fixture role must have no inherited memberships';
  END IF;
END $$;
"""
EMPTY_SQL = """
SELECT count(*) FROM pg_namespace
WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema'
  AND nspname NOT IN ('public', 'som40_fixture');
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S','f');
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';
"""


def endpoint_key(endpoint):
    return tuple(endpoint.get(key) for key in ('host', 'port', 'database', 'user'))


def validate_drill(config, opt_in):
    if opt_in != 'disposable-test' or config.get('fixture_source') is not True:
        raise ValueError('Synthetic fixture source and disposable-test opt-in required')
    for name in ('source', 'target'):
        endpoint = config.get(name, {})
        if not all(endpoint.get(key) for key in ('host', 'port', 'database', 'user')):
            raise ValueError('Explicit endpoint fields required')
        if endpoint not in config.get(name + '_allowlist', []):
            raise ValueError('Endpoint absent from explicit allowlist')
    if endpoint_key(config['source']) == endpoint_key(config['target']):
        raise ValueError('Source and target must be independent endpoints')
    # Credentials differing alone do not make an independent database.
    if endpoint_key(config['source'])[:3] == endpoint_key(config['target'])[:3]:
        raise ValueError('Source and target identify the same database')


def query(endpoint, password_variable, sql):
    password = os.environ.get(password_variable)
    if not password:
        raise ValueError('Required password environment variable missing')
    environment = os.environ.copy()
    # Do not inherit libpq defaults that could redirect a validated endpoint.
    for key in tuple(environment):
        if key.startswith('PG'):
            del environment[key]
    environment['PGPASSWORD'] = password
    environment['PGCONNECT_TIMEOUT'] = '15'
    environment['PGSSLMODE'] = 'prefer'
    result = subprocess.run([
        'psql', '-X', '-qAt', '--no-password', '--set', 'ON_ERROR_STOP=1',
        '--host', str(endpoint['host']), '--port', str(endpoint['port']),
        '--dbname', str(endpoint['database']), '--username', str(endpoint['user']),
    ], input=sql, text=True, capture_output=True, env=environment, timeout=120)
    if result.returncode:
        # PostgreSQL diagnostic output can contain values, URLs or credentials.
        raise RuntimeError('PostgreSQL fixture command failed; diagnostics suppressed')
    return result.stdout.strip()


def assert_scratch_database(endpoint, variable):
    if query(endpoint, variable, EMPTY_SQL).splitlines() != ['0', '0', '0']:
        raise ValueError('Drill requires a scratch database with no application schemas/objects')


def identity(endpoint, variable):
    # System identifier distinguishes clusters even behind proxies or host aliases.
    return query(endpoint, variable, "SELECT system_identifier::text || ':' || "
                 "(SELECT oid::text FROM pg_database WHERE datname=current_database()) "
                 "FROM pg_control_system();")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--opt-in', required=True, choices=['disposable-test'])
    args = parser.parse_args(argv)
    config = json.loads(args.config.read_text())
    backup._validate(config)
    backup._env()
    validate_drill(config, args.opt_in)
    source, target = config['source'], config['target']
    # All safety checks precede role creation or fixture replacement at either end.
    assert_scratch_database(source, 'PILOT_SOURCE_PASSWORD')
    assert_scratch_database(target, 'PILOT_TARGET_PASSWORD')
    if identity(source, 'PILOT_SOURCE_PASSWORD') == identity(target, 'PILOT_TARGET_PASSWORD'):
        raise ValueError('Live source and target database identities are equal')
    for endpoint, variable in ((source, 'PILOT_SOURCE_PASSWORD'), (target, 'PILOT_TARGET_PASSWORD')):
        query(endpoint, variable, ROLE_SQL)
    query(source, 'PILOT_SOURCE_PASSWORD', (FIXTURES / 'source.sql').read_text())
    query(source, 'PILOT_SOURCE_PASSWORD', (FIXTURES / 'verify.sql').read_text())
    with tempfile.TemporaryDirectory(prefix='som40-drill-') as output:
        for attempt in (1, 2):
            artifact = backup.dump(config, output)
            backup.verify(artifact, decrypt=True)
            backup.restore(config, artifact, args.opt_in)
            query(target, 'PILOT_TARGET_PASSWORD', (FIXTURES / 'verify.sql').read_text())
            print(json.dumps({'event': 'synthetic_restore_verified', 'attempt': attempt,
                              'checks': ['rows', 'schema', 'constraints', 'function', 'RLS', 'role_grants']}))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError, backup.BackupError):
        print('Synthetic restore drill failed; diagnostics suppressed', file=sys.stderr)
        sys.exit(1)
