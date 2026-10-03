"""Offline failure tests; subprocesses and storage are mocks, never real restore."""
import datetime as dt
import importlib.util
import json
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pilot_backup', ROOT / 'backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class TemporaryCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def load(self, value):
        path = self.directory / 'config.json'
        path.write_text(json.dumps(value))
        return backup.load_config(path)



class ConfigurationTests(TemporaryCase):
    def test_disabled_configuration_fails_closed(self):
        with mock.patch.dict(os.environ, {'DATABASE_URL': 'postgres://user:secret@prod/db'}, clear=True):
            with self.assertRaises(backup.BackupError):
                self.load({'enabled': False})

    def test_database_url_does_not_supply_missing_endpoints(self):
        with mock.patch.dict(os.environ, {'DATABASE_URL': 'postgres://user:secret@prod/db'}, clear=True):
            with self.assertRaises(backup.BackupError):
                self.load({'enabled': True})

    def test_malformed_json_is_controlled_error(self):
        path = self.directory / 'config.json'
        path.write_text('{')
        with self.assertRaises(backup.BackupError):
            backup.load_config(path)

    def test_missing_file_is_controlled_error(self):
        with self.assertRaises(backup.BackupError):
            backup.load_config(self.directory / 'missing.json')

    def test_restore_requires_explicit_disposable_opt_in(self):
        with mock.patch.object(backup.subprocess, 'run') as command:
            with self.assertRaises(backup.BackupError):
                backup.restore({}, self.directory, '')
            command.assert_not_called()

    def test_verify_rejects_missing_bundle(self):
        with self.assertRaises(backup.BackupError):
            backup.verify(self.directory / 'missing')



def configuration():
    source = {'host': 'localhost', 'port': 5432, 'database': 'fixture', 'user': 'backup'}
    target = {'host': '127.0.0.1', 'port': 5432, 'database': 'restore', 'user': 'restore', 'kind': 'disposable-test'}
    return {'enabled': True, 'source': source, 'target': target, 'source_allowlist': [dict(source)],
            'target_allowlist': [dict(target)], 'fixture_source': True,
            'encryption_recipient': 'age1' + 'a' * 58, 'retention_days': 6,
            'storage': {'enabled': True, 'bucket': 'private-fixture-bucket', 'prefix': 'pilot/',
                        'endpoint': '', 'region': 'eu-central-1', 'eu_confirmed': True,
                        'private_confirmed': True, 'retention_confirmed': True}}


class SafetyTests(TemporaryCase):
    def test_disabled_valid_config_never_dumps(self):
        config = configuration()
        config['enabled'] = False
        with mock.patch.object(backup, '_run') as run:
            with self.assertRaises(backup.BackupError):
                backup.dump(config, self.directory / 'disabled')
            run.assert_not_called()
        self.assertFalse((self.directory / 'disabled').exists())

    def test_valid_explicit_fixture_configuration(self):
        self.assertEqual(self.load(configuration())['source']['host'], 'localhost')

    def test_source_target_case_alias_refused_even_with_different_user(self):
        config = configuration()
        config['target'].update(host='LOCALHOST', database='fixture', user='other')
        config['target_allowlist'] = [dict(config['target'])]
        with self.assertRaises(backup.BackupError):
            self.load(config)

    def test_nonallowlisted_source_refused(self):
        config = configuration()
        config['source']['host'] = 'unexpected.invalid'
        with self.assertRaises(backup.BackupError):
            self.load(config)

    def test_retention_seven_days_refused_to_leave_schedule_margin(self):
        config = configuration()
        config['retention_days'] = 7
        with self.assertRaises(backup.BackupError):
            self.load(config)

    def test_restore_wrong_opt_in_never_verifies_or_runs(self):
        with mock.patch.object(backup, 'verify') as verify, mock.patch.object(backup, '_run') as run:
            with self.assertRaises(backup.BackupError):
                backup.restore(configuration(), self.directory, 'production')
            verify.assert_not_called()
            run.assert_not_called()

    def test_storage_disabled_and_confirmations_fail_before_network(self):
        for field in ('enabled', 'eu_confirmed', 'private_confirmed', 'retention_confirmed'):
            config = configuration()
            config['storage'][field] = False
            with self.subTest(field=field), mock.patch.object(backup, '_aws') as aws:
                with self.assertRaises(backup.BackupError):
                    backup.upload(config, self.directory)
                aws.assert_not_called()

    def test_external_tool_stderr_cannot_disclose_password(self):
        secret = 'never-print-this-password'
        result = subprocess.CompletedProcess([], 1, stdout=secret.encode(), stderr=secret.encode())
        with mock.patch.object(backup.subprocess, 'run', return_value=result):
            with self.assertRaises(backup.BackupError) as caught:
                backup._run(['pg_dump'], env={})
        self.assertNotIn(secret, str(caught.exception))

    def test_passwords_are_environment_only_and_role_isolated(self):
        with mock.patch.dict(os.environ, {'PILOT_SOURCE_PASSWORD': 'source-secret',
                                        'PILOT_TARGET_PASSWORD': 'target-secret',
                                        'PILOT_AGE_IDENTITY_FILE': '/secret/identity'}, clear=True):
            source_env = backup._env('source')
            self.assertEqual(source_env['PGPASSWORD'], 'source-secret')
            self.assertEqual(source_env['PGSSLMODE'], 'require')
            self.assertNotIn('PILOT_TARGET_PASSWORD', source_env)
            self.assertNotIn('PILOT_AGE_IDENTITY_FILE', source_env)
            self.assertNotIn('source-secret', backup._connection(configuration()['source']))

    def test_database_url_and_pg_overrides_refused(self):
        for key in ('DATABASE_URL', 'PGHOST', 'PGSERVICE', 'PGPASSWORD'):
            with self.subTest(key=key), mock.patch.dict(os.environ, {key: 'unexpected'}, clear=True):
                with self.assertRaises(backup.BackupError):
                    backup._env('source')

    def test_failed_dump_removes_partial_bundle_and_plaintext(self):
        plain_paths = []
        def fail(argv, env=None):
            plain = Path(argv[argv.index('--file') + 1])
            plain.write_bytes(b'sensitive fixture')
            plain_paths.append(plain)
            raise backup.BackupError('mock dump failure')
        output = self.directory / 'output'
        with mock.patch.dict(os.environ, {'PILOT_SOURCE_PASSWORD': 'secret'}, clear=True), mock.patch.object(backup, '_run', side_effect=fail):
            with self.assertRaises(backup.BackupError):
                backup.dump(configuration(), output)
        self.assertEqual(list(output.iterdir()), [])
        self.assertTrue(plain_paths)
        self.assertTrue(all(not path.exists() for path in plain_paths))

    def bundle(self):
        bundle = self.directory / 'backup-fixture'
        bundle.mkdir(mode=0o700)
        cipher = b'encrypted-fixture'
        (bundle / 'database.dump.age').write_bytes(cipher)
        manifest = {'format': 1, 'created_at': '2026-10-03T00:00:00+00:00',
                    'plaintext_sha256': hashlib.sha256(b'plaintext-fixture').hexdigest(),
                    'ciphertext_sha256': hashlib.sha256(cipher).hexdigest(),
                    'ciphertext_bytes': len(cipher)}
        (bundle / 'manifest.json').write_text(json.dumps(manifest))
        return bundle

    def test_nonobject_manifest_fails_with_controlled_error(self):
        bundle = self.bundle()
        for value in ([], None, 123, 'personal data'):
            with self.subTest(value=value):
                (bundle / 'manifest.json').write_text(json.dumps(value))
                with mock.patch.object(backup, '_decrypt') as decrypt:
                    with self.assertRaises(backup.BackupError):
                        backup.verify(bundle)
                    decrypt.assert_not_called()

    def test_unknown_manifest_fields_and_injected_coverage_refused(self):
        bundle = self.bundle()
        manifest = json.loads((bundle / 'manifest.json').read_text())
        for field in ('customer_email', 'coverage'):
            changed = dict(manifest, **{field: 'private-customer@example.invalid'})
            (bundle / 'manifest.json').write_text(json.dumps(changed))
            with self.subTest(field=field), mock.patch.object(backup, '_decrypt') as decrypt:
                with self.assertRaises(backup.BackupError) as caught:
                    backup.verify(bundle)
                self.assertNotIn('private-customer', str(caught.exception))
                decrypt.assert_not_called()

    def test_naive_manifest_timestamp_refused(self):
        bundle = self.bundle()
        manifest = json.loads((bundle / 'manifest.json').read_text())
        manifest['created_at'] = '2026-10-03T00:00:00'
        (bundle / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(backup.BackupError):
            backup.verify(bundle)

    def test_ciphertext_mismatch_prevents_decryption(self):
        bundle = self.bundle()
        (bundle / 'database.dump.age').write_bytes(b'tampered')
        with mock.patch.object(backup, '_decrypt') as decrypt:
            with self.assertRaisesRegex(backup.BackupError, 'checksum'):
                backup.verify(bundle)
            decrypt.assert_not_called()

    def test_plaintext_mismatch_cleans_temporary_dump(self):
        bundle = self.bundle()
        paths = []
        def decrypt(bundle, destination):
            destination.write_bytes(b'tampered plaintext')
            paths.append(destination)
        with mock.patch.object(backup, '_decrypt', side_effect=decrypt), mock.patch.object(backup, '_run') as run:
            with self.assertRaisesRegex(backup.BackupError, 'checksum'):
                backup.verify(bundle, decrypt=True)
            run.assert_not_called()
        self.assertTrue(all(not path.exists() for path in paths))

    def test_successful_verify_uses_mock_plaintext_and_cleans_it(self):
        bundle = self.bundle()
        paths = []
        def decrypt(bundle, destination):
            destination.write_bytes(b'plaintext-fixture')
            paths.append(destination)
        with mock.patch.object(backup, '_decrypt', side_effect=decrypt), mock.patch.object(backup, '_run', return_value=b'') as run:
            self.assertEqual(backup.verify(bundle, decrypt=True)['format'], 1)
            self.assertEqual(run.call_args.args[0][0:2], ['pg_restore', '--list'])
        self.assertTrue(all(not path.exists() for path in paths))

    def test_bundle_symlink_is_refused(self):
        bundle = self.bundle()
        link = self.directory / 'link'
        link.symlink_to(bundle, target_is_directory=True)
        with self.assertRaises(backup.BackupError):
            backup.verify(link)


    def test_physical_database_alias_refused_before_restore(self):
        manifest = {'plaintext_sha256': 'a' * 64}
        with mock.patch.dict(os.environ, {'PILOT_SOURCE_PASSWORD': 'source', 'PILOT_TARGET_PASSWORD': 'target'}, clear=True), mock.patch.object(backup, 'verify', return_value=manifest), mock.patch.object(backup, '_run', return_value=b'123:456\n') as run, mock.patch.object(backup, '_decrypt') as decrypt:
            with self.assertRaisesRegex(backup.BackupError, 'same database'):
                backup.restore(configuration(), self.directory, 'disposable-test')
            self.assertEqual(run.call_count, 2)
            self.assertTrue(all(call.args[0][0] == 'psql' for call in run.call_args_list))
            decrypt.assert_not_called()

    def test_dump_warning_is_failure_without_logging_secret(self):
        result = subprocess.CompletedProcess([], 0, stdout=b'', stderr=b'warning private-secret')
        with mock.patch.object(backup.subprocess, 'run', return_value=result):
            with self.assertRaises(backup.BackupError) as caught:
                backup._run(['pg_dump'], env={})
        self.assertNotIn('private-secret', str(caught.exception))

    def test_ciphertext_only_verification_never_decrypts(self):
        with mock.patch.object(backup, '_decrypt') as decrypt, mock.patch.object(backup, '_run') as run:
            self.assertEqual(backup.verify(self.bundle())['format'], 1)
            decrypt.assert_not_called()
            run.assert_not_called()


class StorageTests(TemporaryCase):
    def test_retention_utc_boundary_and_prefix_scope(self):
        now = dt.datetime(2026, 10, 3, tzinfo=dt.timezone.utc)
        config = configuration()
        cutoff = now - dt.timedelta(days=config['retention_days']) + dt.timedelta(hours=1)
        page = {'Contents': [
            {'Key': 'pilot/old', 'LastModified': (cutoff - dt.timedelta(seconds=1)).isoformat()},
            {'Key': 'pilot/boundary', 'LastModified': cutoff.isoformat()},
            {'Key': 'pilot/young', 'LastModified': (cutoff + dt.timedelta(seconds=1)).isoformat()}]}
        def aws(storage, operation, *args):
            return page if operation == 'list-objects-v2' else {}
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, '_aws', side_effect=aws) as commands:
            self.assertEqual(backup.retention(config, now)['deleted_count'], 2)
        deletes = [call.args for call in commands.call_args_list if call.args[1] == 'delete-object']
        self.assertEqual([args[-1] for args in deletes], ['pilot/old', 'pilot/boundary'])

    def test_retention_refuses_naive_clock(self):
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, '_aws') as aws:
            with self.assertRaises(backup.BackupError):
                backup.retention(configuration(), dt.datetime(2026, 10, 3))
            aws.assert_not_called()

    def test_retention_outside_prefix_never_deletes(self):
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, '_aws', return_value={'Contents': [{'Key': 'other/data', 'LastModified': '2020-01-01T00:00:00Z'}]}) as aws:
            with self.assertRaises(backup.BackupError):
                backup.retention(configuration())
            self.assertFalse(any(call.args[1] == 'delete-object' for call in aws.call_args_list))

    def test_retention_repeated_pagination_token_refused(self):
        page = {'IsTruncated': True, 'NextContinuationToken': 'repeat', 'Contents': []}
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, '_aws', return_value=page) as aws:
            with self.assertRaises(backup.BackupError):
                backup.retention(configuration())
            self.assertEqual(aws.call_count, 2)

    def storage_response(self, operation):
        return {'get-bucket-location': {'LocationConstraint': 'eu-central-1'},
                'get-bucket-versioning': {}, 'get-bucket-acl': {'Grants': []},
                'get-public-access-block': {'PublicAccessBlockConfiguration': {
                    key: True for key in ('BlockPublicAcls', 'IgnorePublicAcls', 'BlockPublicPolicy', 'RestrictPublicBuckets')}},
                'get-bucket-lifecycle-configuration': {'Rules': [{'Status': 'Enabled', 'Filter': {'Prefix': 'pilot/'}, 'Expiration': {'Days': 6}, 'AbortIncompleteMultipartUpload': {'DaysAfterInitiation': 1}}]}}[operation]

    def test_enabled_and_suspended_versioning_are_refused(self):
        for status in ('Enabled', 'Suspended'):
            def aws(storage, operation, *args):
                return {'Status': status} if operation == 'get-bucket-versioning' else self.storage_response(operation)
            with self.subTest(status=status), mock.patch.object(backup, '_aws', side_effect=aws):
                with self.assertRaisesRegex(backup.BackupError, 'Versioned'):
                    backup._storage_checks(configuration()['storage'])

    def test_lifecycle_requires_incomplete_multipart_cleanup_and_expiration(self):
        for change in ({'AbortIncompleteMultipartUpload': {}}, {'Expiration': {'Days': 8}}):
            def aws(storage, operation, *args):
                response = self.storage_response(operation)
                if operation == 'get-bucket-lifecycle-configuration':
                    response['Rules'][0].update(change)
                return response
            with self.subTest(change=change), mock.patch.object(backup, '_aws', side_effect=aws):
                with self.assertRaises(backup.BackupError):
                    backup._storage_checks(configuration()['storage'])

    def test_partial_upload_cleans_both_keys_then_retry_can_succeed(self):
        bundle = self.directory / 'backup-fixture'
        bundle.mkdir()
        for name in ('database.dump.age', 'manifest.json'):
            (bundle / name).write_bytes(name.encode())
        manifest = {'created_at': dt.datetime.now(dt.timezone.utc).isoformat()}
        puts = []
        deletes = []
        def fail(storage, operation, *args):
            if operation == 'put-object':
                puts.append(args[args.index('--key') + 1])
                if len(puts) == 2:
                    raise backup.BackupError('mock network failure')
            elif operation == 'get-object':
                key = args[args.index('--key') + 1]
                Path(args[-1]).write_bytes((bundle / key.rsplit('/', 1)[-1]).read_bytes())
            elif operation == 'delete-object':
                deletes.append(args[args.index('--key') + 1])
            return {}
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, 'verify', return_value=manifest), mock.patch.object(backup, 'retention') as retention:
            with mock.patch.object(backup, '_aws', side_effect=fail):
                with self.assertRaises(backup.BackupError):
                    backup.upload(configuration(), bundle)
            self.assertEqual(deletes, puts)
            retention.assert_not_called()
            puts.clear()
            with mock.patch.object(backup, '_aws', side_effect=lambda storage, operation, *args: fail(storage, operation, *args) if operation != 'put-object' else {}) as aws:
                self.assertEqual(backup.upload(configuration(), bundle)['uploaded_count'], 2)
                self.assertEqual(aws.call_count, 4)
                for call in aws.call_args_list:
                    if call.args[1] == 'put-object':
                        self.assertNotIn('--acl', call.args)
            retention.assert_called_once()


    def test_retention_aborts_all_prefix_multipart_uploads(self):
        def aws(storage, operation, *args):
            if operation == 'list-multipart-uploads':
                return {'Uploads': [{'Key': 'pilot/incomplete', 'UploadId': 'upload-1'}]}
            return {}
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, '_aws', side_effect=aws) as aws:
            result = backup.retention(configuration())
            self.assertEqual(result['aborted_count'], 1)
        abort = [call.args for call in aws.call_args_list if call.args[1] == 'abort-multipart-upload']
        self.assertEqual(len(abort), 1)
        self.assertEqual(abort[0][-4:], ('--key', 'pilot/incomplete', '--upload-id', 'upload-1'))

    def test_old_bundle_cannot_be_reuploaded_to_extend_retention(self):
        manifest = {'created_at': '2020-01-01T00:00:00+00:00'}
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, 'verify', return_value=manifest), mock.patch.object(backup, '_aws') as aws:
            with self.assertRaises(backup.BackupError):
                backup.upload(configuration(), self.directory / 'backup-fixture')
            aws.assert_not_called()


    def test_upload_readback_corruption_cleans_remote_and_local_temp(self):
        bundle = self.directory / 'backup-fixture'
        bundle.mkdir()
        (bundle / 'database.dump.age').write_bytes(b'original')
        paths = []
        def aws(storage, operation, *args):
            if operation == 'get-object':
                path = Path(args[-1])
                path.write_bytes(b'corrupt')
                paths.append(path)
            return {}
        manifest = {'created_at': dt.datetime.now(dt.timezone.utc).isoformat()}
        with mock.patch.object(backup, '_storage_checks'), mock.patch.object(backup, 'verify', return_value=manifest), mock.patch.object(backup, 'retention') as retention, mock.patch.object(backup, '_aws', side_effect=aws) as commands:
            with self.assertRaisesRegex(backup.BackupError, 'checksum'):
                backup.upload(configuration(), bundle)
            self.assertEqual(sum(call.args[1] == 'delete-object' for call in commands.call_args_list), 1)
            retention.assert_not_called()
        self.assertTrue(paths)
        self.assertTrue(all(not path.exists() for path in paths))


if __name__ == '__main__':
    unittest.main()
