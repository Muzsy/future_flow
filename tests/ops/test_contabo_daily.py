import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('alterward_backup', directory / 'contabo-backup.py')
library = importlib.util.module_from_spec(spec)
sys.modules['alterward_backup'] = library
spec.loader.exec_module(library)
spec = importlib.util.spec_from_file_location('daily', directory / 'contabo-daily.py')
daily = importlib.util.module_from_spec(spec)
spec.loader.exec_module(daily)
NOW = dt.datetime(2026, 10, 10, 4, 0, tzinfo=dt.timezone.utc)


def test_read(path):
    # Windows cannot express POSIX mode/uid; keep real link/type/hash checks.
    # Production's strict permission check is separately tested with stat faults.
    value = path.lstat()
    if path.is_symlink() or not path.is_file() or value.st_nlink != 1:
        raise ValueError('Linked/nonregular input')
    return path.read_bytes()


def create_archive(root, created):
    run_id = created.strftime('%Y%m%dT%H%M%SZ-') + '12345678'
    path = root / run_id
    path.mkdir(mode=0o700)
    encrypted = {}
    for name in ['config.tar.age', 'application.dump.age']:
        data = b'encrypted-test-fixture'
        (path / name).write_bytes(data)
        os.chmod(path / name, 0o600)
        encrypted[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    manifest = {'schemaVersion': 'contabo-backup-1', 'managedBy': 'alterward-daily-1',
                'runId': run_id, 'capturedAt': created.isoformat(), 'encryptedFiles': encrypted}
    (path / 'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
    os.chmod(path / 'manifest.json', 0o600)
    return path


class DailyArchiveTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name).resolve()
        self.uid = patch.object(daily, 'UID', getattr(os, 'getuid', lambda: 0)())
        self.uid.start()
        self.reader = patch.object(daily, 'regular', side_effect=test_read)
        self.reader.start()
        # Windows directory mode reports 0777 regardless of chmod. Its real
        # retention implementation is Node+ACL; Python expiry runs on Linux.
        self.modes = patch.object(daily.stat, 'S_IMODE', return_value=0o700) if os.name == 'nt' else None
        if self.modes:
            self.modes.start()

    def tearDown(self):
        if self.modes:
            self.modes.stop()
        self.reader.stop()
        self.uid.stop()
        self.tmp.cleanup()

    def test_exactly_seven_days_preserved_older_removed(self):
        old = create_archive(self.root, NOW - dt.timedelta(days=7, seconds=1))
        boundary = create_archive(self.root, NOW - dt.timedelta(days=7))
        fresh = create_archive(self.root, NOW)
        self.assertEqual(daily.expire(self.root, NOW), 1)
        self.assertFalse(old.exists())
        self.assertTrue(boundary.exists() and fresh.exists())

    def test_retention_does_not_silently_extend_last_copy(self):
        old = create_archive(self.root, NOW - dt.timedelta(days=8))
        self.assertEqual(daily.expire(self.root, NOW), 1)
        self.assertFalse(old.exists())

    def test_corrupt_archive_blocks_whole_batch_before_deletion(self):
        old = create_archive(self.root, NOW - dt.timedelta(days=8))
        fresh = create_archive(self.root, NOW)
        (fresh / 'application.dump.age').write_bytes(b'corrupt')
        with self.assertRaises(ValueError):
            daily.expire(self.root, NOW)
        self.assertTrue(old.exists())

    def test_extra_file_or_incomplete_archive_blocks_deletion(self):
        for name in ['extra.txt', 'manifest.json']:
            with self.subTest(name=name):
                separate = self.root / name.replace('.', '-')
                separate.mkdir()
                old = create_archive(separate, NOW - dt.timedelta(days=8))
                if name == 'extra.txt':
                    (old / name).write_text('unmanaged')
                else:
                    (old / name).unlink()
                with self.assertRaises(ValueError):
                    daily.expire(separate, NOW)
                self.assertTrue(old.exists())

    def test_unmanaged_directory_never_deleted(self):
        old = create_archive(self.root, NOW - dt.timedelta(days=8))
        (self.root / 'historic-rehearsal').mkdir()
        with self.assertRaises(ValueError):
            daily.expire(self.root, NOW)
        self.assertTrue(old.exists())

    def test_timestamp_mismatch_or_future_rejected(self):
        future = create_archive(self.root, NOW + dt.timedelta(hours=1))
        with self.assertRaises(ValueError):
            daily.retention_plan(self.root, NOW)
        manifest = json.loads((future / 'manifest.json').read_text())
        manifest['capturedAt'] = NOW.isoformat()
        (future / 'manifest.json').write_text(json.dumps(manifest))
        with self.assertRaises(ValueError):
            daily.retention_plan(self.root, NOW)

    def test_hardlinked_ciphertext_rejected_before_deletion(self):
        old = create_archive(self.root, NOW - dt.timedelta(days=8))
        link = self.root.parent / (self.root.name + '-linked')
        try:
            os.link(old / 'config.tar.age', link)
            with self.assertRaises(ValueError):
                daily.expire(self.root, NOW)
            self.assertTrue(old.exists())
        finally:
            if link.exists():
                link.unlink()

    def test_symlink_target_outside_archive_is_not_followed(self):
        if os.name == 'nt':
            self.skipTest('Windows symlink privilege unavailable; real Linux test required')
        outside = self.root.parent / (self.root.name + '-outside')
        outside.mkdir()
        link = self.root / '20261001T040000Z-12345678'
        try:
            link.symlink_to(outside, target_is_directory=True)
            with self.assertRaises(ValueError):
                daily.expire(self.root, NOW)
            self.assertTrue(outside.exists())
        finally:
            link.unlink()
            outside.rmdir()

    def test_pending_cleanup_is_scoped_and_rejects_foreign_entries(self):
        backups = self.root / 'backups'
        backups.mkdir()
        path = backups / '.pending-20261010T040000Z-12345678'
        path.mkdir(mode=0o700)
        (path / 'config.tar.age').write_bytes(b'partial')
        with patch.object(daily, 'ROOT', self.root):
            self.assertEqual(daily.clean_pending(), 1)
            path.mkdir(mode=0o700)
            (path / 'unknown').write_bytes(b'keep')
            with self.assertRaises(ValueError):
                daily.clean_pending()
            self.assertTrue((path / 'unknown').exists())


class MonitorTests(unittest.TestCase):
    def healthy(self):
        return {'ownerHealthy': True, 'databaseTlsVerified': True, 'pendingJobs': 0,
                'anonymousDenied': 4, 'edgeClosed': True, 'diskFreeBytes': 10 * 1024**3,
                'originCertificateOver30Days': True, 'lastBackupAt': NOW.isoformat(),
                'backupFailed': False}

    def test_fresh_healthy_owner_has_no_alerts(self):
        self.assertEqual(daily.alerts_for(self.healthy(), NOW), [])

    def test_stale_or_missing_backup_alerts(self):
        for value in [None, (NOW - dt.timedelta(hours=26, seconds=1)).isoformat()]:
            health = {**self.healthy(), 'lastBackupAt': value}
            self.assertEqual(daily.alerts_for(health, NOW), ['backup_stale'])

    def test_runtime_queue_gate_space_certificate_and_failure_alerts(self):
        health = {**self.healthy(), 'ownerHealthy': False, 'databaseTlsVerified': False,
                  'pendingJobs': 1, 'anonymousDenied': 3, 'diskFreeBytes': 1,
                  'originCertificateOver30Days': False, 'backupFailed': True}
        self.assertEqual(daily.alerts_for(health, NOW), ['owner_runtime', 'database_tls',
            'unexpected_owner_jobs', 'access_boundary', 'disk_space', 'origin_certificate', 'backup_failed'])

    def test_private_file_rejects_wrong_mode_and_links(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / 'file'
            for mode, links in [(0o100644, 1), (0o100600, 2), (0o120600, 1)]:
                value = SimpleNamespace(st_mode=mode, st_nlink=links, st_uid=daily.UID)
                with patch.object(Path, 'lstat', return_value=value), self.assertRaises(ValueError):
                    daily.regular(path)


if __name__ == '__main__':
    unittest.main()
