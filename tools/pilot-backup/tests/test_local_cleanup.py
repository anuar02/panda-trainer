"""Offline local rotation tests with synthetic, private scratch directories."""
import datetime as dt
import json
import os
from pathlib import Path
import unittest

from test_backup import TemporaryCase, backup


class LocalCleanupTests(TemporaryCase):
    def setUp(self):
        super().setUp()
        self.root = self.directory / 'dedicated'
        self.root.mkdir(mode=0o700)
        self.now = dt.datetime(2026, 10, 3, tzinfo=dt.timezone.utc)
        self.cutoff = self.now - dt.timedelta(days=6) + dt.timedelta(hours=1)

    def bundle(self, name, created=None, partial=False):
        bundle = self.root / name
        bundle.mkdir(mode=0o700)
        (bundle / 'database.dump.age').write_bytes(b'fixture')
        if not partial:
            (bundle / 'manifest.json').write_text(json.dumps({'created_at': created.isoformat()}))
        else:
            os.utime(bundle, (created.timestamp(), created.timestamp()))
        return bundle

    def test_boundary_expired_deleted_fresh_bundle_untouched(self):
        old = self.bundle('backup-old', self.cutoff - dt.timedelta(seconds=1))
        boundary = self.bundle('backup-boundary', self.cutoff)
        fresh = self.bundle('backup-fresh', self.cutoff + dt.timedelta(seconds=1))
        backup.cleanup_local(self.root, self.now)
        self.assertFalse(old.exists())
        self.assertFalse(boundary.exists())
        self.assertTrue((fresh / 'database.dump.age').is_file())

    def test_partial_bundle_uses_directory_mtime_and_fresh_partial_stays(self):
        old = self.bundle('backup-partial-old', self.cutoff, partial=True)
        fresh = self.bundle('backup-partial-fresh', self.now, partial=True)
        backup.cleanup_local(self.root, self.now)
        self.assertFalse(old.exists())
        self.assertTrue(fresh.exists())

    def test_unrelated_directory_or_file_never_deleted(self):
        unrelated = self.bundle('unrelated-old', self.cutoff - dt.timedelta(days=30))
        file = self.root / 'unrelated-file'
        file.write_bytes(b'unrelated')
        timestamp = (self.cutoff - dt.timedelta(days=30)).timestamp()
        os.utime(file, (timestamp, timestamp))
        backup.cleanup_local(self.root, self.now)
        self.assertTrue(unrelated.exists())
        self.assertEqual(file.read_bytes(), b'unrelated')

    def test_backup_named_file_refused_without_any_deletion(self):
        old = self.bundle('backup-old', self.cutoff)
        file = self.root / 'backup-file'
        file.write_bytes(b'keep')
        with self.assertRaises(backup.BackupError):
            backup.cleanup_local(self.root, self.now)
        self.assertTrue(old.exists())
        self.assertEqual(file.read_bytes(), b'keep')

    def test_symlink_root_refused_without_following(self):
        target = self.bundle('backup-old', self.cutoff)
        link = self.directory / 'alias'
        link.symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(backup.BackupError):
            backup.cleanup_local(link, self.now)
        self.assertTrue(target.exists())

    def test_symlink_child_refused_without_deleting_outside(self):
        outside = self.directory / 'outside'
        outside.mkdir(mode=0o700)
        marker = outside / 'marker'
        marker.write_bytes(b'keep')
        (self.root / 'backup-link').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(backup.BackupError):
            backup.cleanup_local(self.root, self.now)
        self.assertEqual(marker.read_bytes(), b'keep')

    def test_descendant_symlink_refused_before_expired_bundle_deletion(self):
        old = self.bundle('backup-old', self.cutoff)
        outside = self.directory / 'outside-secret'
        outside.write_bytes(b'keep')
        (old / 'linked-secret').symlink_to(outside)
        with self.assertRaises(backup.BackupError):
            backup.cleanup_local(self.root, self.now)
        self.assertTrue(old.exists())
        self.assertEqual(outside.read_bytes(), b'keep')

    def test_nonprivate_root_refused(self):
        self.root.chmod(0o755)
        with self.assertRaises(backup.BackupError):
            backup.cleanup_local(self.root, self.now)


if __name__ == '__main__':
    unittest.main()
