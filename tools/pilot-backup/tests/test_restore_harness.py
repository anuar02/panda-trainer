"""Harness orchestration checks with fake queries and backups, never real restore."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest import mock

from test_backup import TemporaryCase, backup, configuration

spec = importlib.util.spec_from_file_location('restore_harness', Path(__file__).resolve().parents[1] / 'restore_harness.py')
harness = importlib.util.module_from_spec(spec)
with mock.patch.dict(sys.modules, {'backup': backup}):
    spec.loader.exec_module(harness)


class HarnessTests(TemporaryCase):
    def args(self, config=None):
        path = self.directory / 'config.json'
        path.write_text(json.dumps(configuration() if config is None else config))
        return ['--config', str(path), '--opt-in', 'disposable-test']

    def test_fixture_source_flag_required_before_query_or_dump(self):
        config = configuration()
        config['fixture_source'] = False
        with mock.patch.object(harness, 'query') as query, mock.patch.object(backup, 'dump') as dump:
            with self.assertRaises(ValueError):
                harness.main(self.args(config))
            query.assert_not_called()
            dump.assert_not_called()

    def test_populated_source_or_target_prevents_all_mutations(self):
        for populated in ('source', 'target'):
            calls = []
            def query(endpoint, variable, sql):
                calls.append((endpoint['database'], sql))
                self.assertEqual(sql, harness.EMPTY_SQL)
                database = 'fixture' if populated == 'source' else 'restore'
                return '1\n0\n0' if endpoint['database'] == database else '0\n0\n0'
            with self.subTest(populated=populated), mock.patch.object(harness, 'query', side_effect=query), mock.patch.object(backup, 'dump') as dump:
                with self.assertRaisesRegex(ValueError, 'scratch database'):
                    harness.main(self.args())
                dump.assert_not_called()
            self.assertEqual(len(calls), 1 if populated == 'source' else 2)

    def test_both_scratch_checks_and_physical_identities_precede_mutation(self):
        events = []
        def query(endpoint, variable, sql):
            if sql == harness.EMPTY_SQL:
                events.append('scratch:' + endpoint['database'])
                return '0\n0\n0'
            self.assertIn('pg_control_system', sql)
            events.append('identity:' + endpoint['database'])
            return '123:456'
        with mock.patch.object(harness, 'query', side_effect=query), mock.patch.object(backup, 'dump') as dump:
            with self.assertRaisesRegex(ValueError, 'identities are equal'):
                harness.main(self.args())
            dump.assert_not_called()
        self.assertEqual(events, ['scratch:fixture', 'scratch:restore', 'identity:fixture', 'identity:restore'])

    def test_main_runs_two_mock_drills_after_all_safety_checks(self):
        events = []
        def query(endpoint, variable, sql):
            name = endpoint['database']
            if sql == harness.EMPTY_SQL:
                events.append('scratch:' + name)
                return '0\n0\n0'
            if 'pg_control_system' in sql:
                events.append('identity:' + name)
                return '123:456' if name == 'fixture' else '123:789'
            self.assertEqual(events[:4], ['scratch:fixture', 'scratch:restore', 'identity:fixture', 'identity:restore'])
            events.append('mutation:' + name)
            return ''
        artifact = self.directory / 'backup-mock'
        output = io.StringIO()
        with mock.patch.object(harness, 'query', side_effect=query), mock.patch.object(backup, 'dump', return_value=artifact) as dump, mock.patch.object(backup, 'verify', return_value={}) as verify, mock.patch.object(backup, 'restore', return_value={}) as restore, contextlib.redirect_stdout(output):
            self.assertEqual(harness.main(self.args()), 0)
        self.assertEqual(dump.call_count, 2)
        self.assertEqual(verify.call_args_list, [mock.call(artifact, decrypt=True)] * 2)
        self.assertEqual(restore.call_count, 2)
        self.assertTrue(all(call.args[2] == 'disposable-test' for call in restore.call_args_list))
        reports = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual([report['attempt'] for report in reports], [1, 2])
        self.assertTrue(all(report['event'] == 'synthetic_restore_verified' for report in reports))
        self.assertEqual(events.count('mutation:restore'), 3)
        for call in dump.call_args_list:
            self.assertFalse(Path(call.args[1]).exists())


if __name__ == '__main__':
    unittest.main()
