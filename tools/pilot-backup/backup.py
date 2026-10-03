#!/usr/bin/env python3
"""Encrypted PostgreSQL pilot backups; external tools: PostgreSQL, age, AWS CLI."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile


COVERAGE = 'Full database visible to dump role; excludes cluster roles, storage object bytes, project secrets and infrastructure configuration.'


class BackupError(Exception):
    pass


def _identity(value):
    if not isinstance(value, dict):
        raise BackupError('Endpoint must be an object')
    if set(value) - {'host', 'port', 'database', 'user', 'kind'}:
        raise BackupError('Endpoint contains unsupported fields')
    fields = []
    for key in ('host', 'database', 'user'):
        item = value.get(key)
        if not isinstance(item, str) or not re.fullmatch(r'[A-Za-z0-9_.-]+', item):
            raise BackupError('Invalid endpoint field')
        fields.append(item.lower() if key == 'host' else item)
    port = value.get('port')
    if type(port) is not int or not 1 <= port <= 65535:
        raise BackupError('Invalid endpoint port')
    return ('localhost' if fields[0] in ('localhost', '127.0.0.1') else fields[0], port, fields[1], fields[2])


def _validate(config):
    if not isinstance(config, dict):
        raise BackupError('Configuration must be an object')
    if set(config) - {'source', 'target', 'source_allowlist', 'target_allowlist', 'storage', 'encryption_recipient', 'retention_days', 'fixture_source', 'enabled'}:
        raise BackupError('Unsupported configuration field')
    source, target = _identity(config.get('source')), _identity(config.get('target'))
    if source[:3] == target[:3] or config['target'].get('kind') != 'disposable-test':
        raise BackupError('Restore requires a distinct disposable target')
    for name, endpoint in [('source', source), ('target', target)]:
        allowed = config.get(name + '_allowlist')
        if not isinstance(allowed, list) or not allowed or endpoint not in [_identity(x) for x in allowed]:
            raise BackupError('Endpoint is not explicitly allowlisted')
    recipient = config.get('encryption_recipient', '')
    if not isinstance(recipient, str) or not re.fullmatch(r'age1[0-9a-z]{58}', recipient):
        raise BackupError('A valid public age recipient is required')
    days = config.get('retention_days', 6)
    if type(days) is not int or not 1 <= days <= 6:
        raise BackupError('Retention must be between one and six days to leave scheduling margin')
    storage = config.get('storage', {})
    if not isinstance(storage, dict) or set(storage) - {'enabled', 'bucket', 'prefix', 'endpoint', 'region', 'eu_confirmed', 'private_confirmed', 'retention_confirmed'}:
        raise BackupError('Invalid storage configuration')
    if 'fixture_source' in config and type(config['fixture_source']) is not bool:
        raise BackupError('fixture_source must be boolean')
    if config.get('fixture_source') is True and any(config[r]['host'] not in ('localhost', '127.0.0.1') for r in ('source', 'target')):
        raise BackupError('Synthetic fixture databases must be local')
    return config


def load_config(path):
    try:
        return _validate(json.loads(Path(path).read_text()))
    except (OSError, ValueError) as exc:
        raise BackupError('Cannot read configuration') from exc


def _env(role=None, config=None):
    if 'DATABASE_URL' in os.environ or any(k.startswith('PG') for k in os.environ):
        raise BackupError('Remove DATABASE_URL and unrelated PG environment overrides')
    env = dict(os.environ)
    if role:
        password = env.get('PILOT_' + role.upper() + '_PASSWORD')
        if not password:
            raise BackupError('Required password environment variable is missing')
        env['PGPASSWORD'] = password
        env['PGSSLMODE'] = 'prefer' if config and config.get('fixture_source') is True and config[role]['host'] in ('localhost', '127.0.0.1', '::1') else 'require'
    for key in ('PILOT_SOURCE_PASSWORD', 'PILOT_TARGET_PASSWORD', 'PILOT_AGE_IDENTITY_FILE'):
        env.pop(key, None)
    return env


def _run(argv, env=None):
    try:
        result = subprocess.run(argv, env=env if env is not None else _env(), stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=300)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise BackupError('Required external tool could not run') from exc
    if result.returncode:
        raise BackupError('External operation failed; tool output suppressed to protect secrets')
    if argv[0] == 'pg_dump' and result.stderr.strip():
        raise BackupError('Dump emitted warnings; output suppressed')
    return result.stdout


def _connection(endpoint):
    return ['--host', endpoint['host'], '--port', str(endpoint['port']), '--username', endpoint['user'], '--dbname', endpoint['database'], '--no-password']


def _sha(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def _private_dir(path):
    path = Path(path)
    if path.is_symlink():
        raise BackupError('Symlink directory is not allowed')
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.stat().st_mode & 0o077:
        raise BackupError('Directory must have mode 0700')
    return path



def cleanup_local(output_dir, now=None):
    """Rotate only backup-* directories in an explicitly supplied private root."""
    root = Path(output_dir).absolute()
    if any(p.is_symlink() for p in (root, *root.parents)):
        raise BackupError('Symlink cleanup root is not allowed')
    root = _private_dir(root)
    now = now or dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None:
        raise BackupError('Cleanup timestamp must be timezone-aware')
    cutoff = now - dt.timedelta(days=6) + dt.timedelta(hours=1)
    expired = []
    try:
        for entry in root.iterdir():
            if not entry.name.startswith('backup-'):
                continue
            if entry.is_symlink() or not entry.is_dir():
                raise BackupError('Backup cleanup entries must be real directories')
            if entry.resolve().parent != root.resolve():
                raise BackupError('Backup cleanup entry escapes private root')
            if any(child.is_symlink() for child in entry.rglob('*')):
                raise BackupError('Symlink in backup cleanup entry')
            created = dt.datetime.fromtimestamp(entry.stat().st_mtime, dt.timezone.utc)
            try:
                manifest = json.loads((entry / 'manifest.json').read_text())
                candidate = dt.datetime.fromisoformat(manifest['created_at'])
                if candidate.tzinfo is not None and candidate <= now:
                    created = candidate
            except (OSError, ValueError, TypeError, KeyError):
                pass
            if created <= cutoff:
                expired.append(entry)
        for entry in expired:
            if entry.is_symlink() or entry.resolve().parent != root.resolve():
                raise BackupError('Backup cleanup entry changed during inventory')
            shutil.rmtree(entry)
        return {'deleted_count': len(expired)}
    except OSError as exc:
        raise BackupError('Local backup cleanup failed') from exc


def dump(config, output_dir):
    _validate(config)
    if config.get('enabled') is not True:
        raise BackupError('Backup operations disabled; explicitly enable configuration')
    parent = _private_dir(output_dir)
    cleanup_local(parent)
    created_at = dt.datetime.now(dt.timezone.utc).isoformat()
    bundle = Path(tempfile.mkdtemp(prefix='backup-', dir=parent))
    try:
        with tempfile.TemporaryDirectory(prefix='backup-private-') as temporary:
            plain = Path(temporary) / 'database.dump'
            _run(['pg_dump', *_connection(config['source']), '--format=custom', '--file', str(plain)], _env('source', config))
            _run(['pg_restore', '--list', str(plain)])
            cipher = bundle / 'database.dump.age'
            _run(['age', '--encrypt', '--recipient', config['encryption_recipient'], '--output', str(cipher), str(plain)])
            cipher.chmod(0o600)
            manifest = {'format': 1, 'created_at': created_at, 'plaintext_sha256': _sha(plain), 'ciphertext_sha256': _sha(cipher), 'ciphertext_bytes': cipher.stat().st_size, 'coverage': COVERAGE}
            (bundle / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
            (bundle / 'manifest.json').chmod(0o600)
        return bundle
    except BaseException:
        shutil.rmtree(bundle)
        raise


def _decrypt(bundle, destination):
    identity = os.environ.get('PILOT_AGE_IDENTITY_FILE')
    if not identity or not Path(identity).is_file() or Path(identity).is_symlink() or Path(identity).stat().st_mode & 0o077:
        raise BackupError('Private age identity file with mode 0600 is required')
    _run(['age', '--decrypt', '--identity', identity, '--output', str(destination), str(bundle / 'database.dump.age')])


def verify(bundle_dir, decrypt=False):
    bundle = Path(bundle_dir)
    try:
        if bundle.is_symlink() or any((bundle / x).is_symlink() for x in ('manifest.json', 'database.dump.age')):
            raise BackupError('Symlink bundle is not allowed')
        manifest = json.loads((bundle / 'manifest.json').read_text())
        allowed = {'format', 'created_at', 'plaintext_sha256', 'ciphertext_sha256', 'ciphertext_bytes', 'coverage'}
        if not isinstance(manifest, dict) or set(manifest) - allowed or manifest.get('coverage', COVERAGE) != COVERAGE:
            raise BackupError('Invalid manifest fields')
        created = dt.datetime.fromisoformat(manifest['created_at'])
        if created.tzinfo is None or type(manifest.get('ciphertext_bytes')) is not int or manifest['ciphertext_bytes'] <= 0:
            raise BackupError('Invalid manifest timestamp or size')
        if manifest.get('format') != 1 or not all(re.fullmatch(r'[a-f0-9]{64}', str(manifest.get(x, ''))) for x in ('plaintext_sha256', 'ciphertext_sha256')):
            raise BackupError('Invalid manifest')
        cipher = bundle / 'database.dump.age'
        if _sha(cipher) != manifest['ciphertext_sha256'] or cipher.stat().st_size != manifest['ciphertext_bytes']:
            raise BackupError('Ciphertext checksum mismatch')
        if decrypt:
            with tempfile.TemporaryDirectory(prefix='backup-private-') as temporary:
                plain = Path(temporary) / 'database.dump'
                _decrypt(bundle, plain)
                if _sha(plain) != manifest['plaintext_sha256']:
                    raise BackupError('Plaintext checksum mismatch')
                _run(['pg_restore', '--list', str(plain)])
        return manifest
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise BackupError('Invalid or unreadable backup bundle') from exc


def restore(config, bundle_dir, opt_in):
    _validate(config)
    if config.get('enabled') is not True:
        raise BackupError('Restore operations disabled; explicitly enable configuration')
    if opt_in != 'disposable-test':
        raise BackupError('Explicit disposable-test restore opt-in required')
    if os.environ.get('GITHUB_ACTIONS') == 'true' and config.get('fixture_source') is not True:
        raise BackupError('Production backup restore is local-only')
    manifest = verify(bundle_dir, decrypt=True)
    identities = []
    for role in ('source', 'target'):
        raw = _run(['psql', '-X', *_connection(config[role]), '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1', '--command', "SELECT system_identifier::text || ':' || (SELECT oid::text FROM pg_database WHERE datname=current_database()) FROM pg_control_system();"], _env(role, config))
        if not re.fullmatch(rb'[0-9]+:[0-9]+', raw.strip()):
            raise BackupError('Cannot verify database cluster identity')
        identities.append(raw.strip())
    if identities[0] == identities[1]:
        raise BackupError('Source and restore target are the same database')
    with tempfile.TemporaryDirectory(prefix='backup-private-') as temporary:
        plain = Path(temporary) / 'database.dump'
        _decrypt(Path(bundle_dir), plain)
        if _sha(plain) != manifest['plaintext_sha256']:
            raise BackupError('Backup changed after verification')
        _run(['pg_restore', *_connection(config['target']), '--clean', '--if-exists', '--exit-on-error', '--single-transaction', str(plain)], _env('target', config))
    return {'restored': True, 'coverage': manifest.get('coverage')}


def _storage(config):
    _validate(config)
    storage = config.get('storage', {})
    if storage.get('enabled') is not True or any(storage.get(x) is not True for x in ('eu_confirmed', 'private_confirmed', 'retention_confirmed')):
        raise BackupError('Storage disabled or owner confirmations missing')
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]', storage.get('bucket', '')) or not re.fullmatch(r'[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*/', storage.get('prefix', '')):
        raise BackupError('Explicit dedicated bucket and prefix required')
    if storage.get('region') != 'eu-central-1':
        raise BackupError('Storage must use Frankfurt eu-central-1')
    endpoint = storage.get('endpoint', '')
    if endpoint and not re.fullmatch(r'https://[A-Za-z0-9.-]+(?::[0-9]+)?', endpoint):
        raise BackupError('Storage endpoint must be HTTPS without credentials')
    return storage


def _aws(storage, operation, *args):
    command = ['aws', 's3api', operation, '--region', storage['region'], '--output', 'json']
    if storage.get('endpoint'):
        command += ['--endpoint-url', storage['endpoint']]
    raw = _run(command + list(args))
    try:
        response = json.loads(raw) if raw.strip() else {}
        if not isinstance(response, dict):
            raise BackupError('Invalid storage response object')
        return response
    except ValueError as exc:
        raise BackupError('Invalid storage response') from exc


def _storage_checks(storage):
    bucket = ['--bucket', storage['bucket']]
    if _aws(storage, 'get-bucket-location', *bucket).get('LocationConstraint') != storage['region']:
        raise BackupError('Bucket region does not match Frankfurt')
    if _aws(storage, 'get-bucket-versioning', *bucket).get('Status') in ('Enabled', 'Suspended'):
        raise BackupError('Versioned buckets are unsupported; versions require separate deletion')
    acl = _aws(storage, 'get-bucket-acl', *bucket)
    if any(g.get('Grantee', {}).get('URI') for g in acl.get('Grants', [])):
        raise BackupError('Bucket has public/group ACL grants')
    block = _aws(storage, 'get-public-access-block', *bucket).get('PublicAccessBlockConfiguration', {})
    if any(block.get(k) is not True for k in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')):
        raise BackupError('Bucket public access is not fully blocked')
    rules = _aws(storage, 'get-bucket-lifecycle-configuration', *bucket).get('Rules', [])
    if not any(r.get('Status') == 'Enabled' and r.get('Filter') == {'Prefix': storage['prefix']} and type(r.get('Expiration', {}).get('Days')) is int and 1 <= r['Expiration']['Days'] <= 7 and r.get('AbortIncompleteMultipartUpload', {}).get('DaysAfterInitiation') == 1 for r in rules):
        raise BackupError('Dedicated prefix requires <=7-day expiration and one-day multipart cleanup')


def retention(config, now=None):
    storage = _storage(config)
    _storage_checks(storage)
    now = now or dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None:
        raise BackupError('Retention timestamp must be timezone-aware')
    cutoff = now - dt.timedelta(days=config.get('retention_days', 6)) + dt.timedelta(hours=1)
    expired = []
    token = None
    seen = set()
    while True:
        args = ['--bucket', storage['bucket'], '--prefix', storage['prefix'], '--no-paginate']
        if token:
            args += ['--continuation-token', token]
        page = _aws(storage, 'list-objects-v2', *args)
        for item in page.get('Contents', []):
            key = item.get('Key', '')
            if not key.startswith(storage['prefix']):
                raise BackupError('Storage returned object outside dedicated prefix')
            try:
                modified = dt.datetime.fromisoformat(item['LastModified'].replace('Z', '+00:00'))
                if modified.tzinfo is None:
                    raise ValueError()
            except (KeyError, ValueError, TypeError) as exc:
                raise BackupError('Invalid object timestamp') from exc
            if modified <= cutoff:
                expired.append(key)
        if not page.get('IsTruncated'):
            break
        token = page.get('NextContinuationToken')
        if not token or token in seen:
            raise BackupError('Incomplete storage pagination')
        seen.add(token)
    uploads = []
    marker_args = []
    markers = set()
    while True:
        page = _aws(storage, 'list-multipart-uploads', '--bucket', storage['bucket'], '--prefix', storage['prefix'], '--no-paginate', *marker_args)
        for item in page.get('Uploads', []):
            if not item.get('Key', '').startswith(storage['prefix']) or not item.get('UploadId'):
                raise BackupError('Invalid multipart upload inventory')
            uploads.append((item['Key'], item['UploadId']))
        if not page.get('IsTruncated'):
            break
        pair = (page.get('NextKeyMarker'), page.get('NextUploadIdMarker'))
        if not all(pair) or pair in markers:
            raise BackupError('Incomplete multipart pagination')
        markers.add(pair)
        marker_args = ['--key-marker', pair[0], '--upload-id-marker', pair[1]]
    for key, upload_id in uploads:
        _aws(storage, 'abort-multipart-upload', '--bucket', storage['bucket'], '--key', key, '--upload-id', upload_id)
    for key in expired:
        _aws(storage, 'delete-object', '--bucket', storage['bucket'], '--key', key)
    return {'deleted_count': len(expired), 'aborted_count': len(uploads)}


def upload(config, bundle_dir):
    storage = _storage(config)
    _storage_checks(storage)
    manifest = verify(bundle_dir)
    try:
        created = dt.datetime.fromisoformat(manifest['created_at'])
        age = dt.datetime.now(dt.timezone.utc) - created
        if age < dt.timedelta(0) or age > dt.timedelta(hours=1):
            raise BackupError('Only fresh bundles may be uploaded; retries must not extend retention')
    except (ValueError, KeyError, TypeError) as exc:
        raise BackupError('Invalid backup creation timestamp') from exc
    bundle = Path(bundle_dir)
    name = bundle.name
    if not re.fullmatch(r'backup-[A-Za-z0-9_-]+', name):
        raise BackupError('Invalid backup bundle name')
    keys = []
    try:
        for filename in ('database.dump.age', 'manifest.json'):
            key = storage['prefix'] + name + '/' + filename
            keys.append(key)
            _aws(storage, 'put-object', '--bucket', storage['bucket'], '--key', key, '--body', str(bundle / filename))
            with tempfile.TemporaryDirectory(prefix='backup-private-') as temporary:
                downloaded = Path(temporary) / filename
                _aws(storage, 'get-object', '--bucket', storage['bucket'], '--key', key, str(downloaded))
                if _sha(downloaded) != _sha(bundle / filename):
                    raise BackupError('Uploaded object checksum mismatch')
            if dt.datetime.now(dt.timezone.utc) - created > dt.timedelta(hours=1):
                raise BackupError('Upload exceeded freshness window; remote copy must be removed')
    except BackupError:
        for key in keys:
            try:
                _aws(storage, 'delete-object', '--bucket', storage['bucket'], '--key', key)
            except BackupError:
                pass
        raise
    retention(config)
    return {'uploaded_count': len(keys)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('dump').add_argument('--output-dir', required=True)
    verify_parser = commands.add_parser('verify')
    verify_parser.add_argument('bundle')
    verify_parser.add_argument('--decrypt', action='store_true')
    commands.add_parser('cleanup-local').add_argument('--output-dir', required=True)
    restore_parser = commands.add_parser('restore')
    restore_parser.add_argument('bundle')
    restore_parser.add_argument('--opt-in', required=True)
    commands.add_parser('retention')
    commands.add_parser('upload').add_argument('bundle')
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        if args.command == 'dump':
            result = {'bundle': str(dump(config, args.output_dir))}
        elif args.command == 'verify':
            result = verify(args.bundle, decrypt=args.decrypt)
        elif args.command == 'cleanup-local':
            result = cleanup_local(args.output_dir)
        elif args.command == 'restore':
            result = restore(config, args.bundle, args.opt_in)
        elif args.command == 'upload':
            result = upload(config, args.bundle)
        else:
            result = retention(config)
        print(json.dumps({'verified': True, 'mode': 'decrypted-archive-check' if args.decrypt else 'ciphertext-checksum'} if args.command == 'verify' else result))
        return 0
    except BackupError as exc:
        print(str(exc), file=__import__('sys').stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
