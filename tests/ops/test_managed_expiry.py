import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

script = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-managed-expiry.py'
spec = importlib.util.spec_from_file_location('managed_expiry', script)
expiry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(expiry)
NOW = dt.datetime(2026, 10, 10, 16, 0, tzinfo=dt.timezone.utc)
PROJECT = 'a' * 64


def fixture(root, captured, suffix='12345678'):
    run_id = captured.strftime('%Y%m%dT%H%M%SZ-') + suffix
    path = root / run_id
    path.mkdir(mode=0o700)
    encrypted = {}
    for name in sorted(expiry.FILES - {'manifest.json'}):
        data = b'synthetic encrypted archive - no personal data'
        (path / name).write_bytes(data)
        os.chmod(path / name, 0o600)
        encrypted[name] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    manifest = {'schemaVersion': 'alterward-managed-recovery-2', 'runId': run_id,
                'capturedAt': captured.isoformat(), 'expiresAt': (captured + dt.timedelta(days=7)).isoformat(),
                'projectBinding': PROJECT, 'sourceCommit': 'b' * 40,
                'postgresImage': expiry.PG_IMAGE, 'scope': 'auth-storage-data-and-public-security',
                'publicDataIncluded': False, 'liveDatabaseWrites': False,
                'restoreOrActivationAllowed': False, 'originalDailyRecipientMatched': True,
                'ephemeralAuthDataExcludedAtCapture': True, 'ephemeralStorageUploadDataExcludedAtCapture': True,
                'authUserTokenColumnsClearedAtCapture': True, 'encryptedFiles': encrypted}
    (path / 'manifest.json').write_text(json.dumps(manifest), encoding='utf8')
    os.chmod(path / 'manifest.json', 0o600)
    return path, manifest


def windows_directory(path):
    # Windows has no POSIX uid/modes. Production Python runs on Linux; preserve
    # original path/type/inode checks here, and test strict permissions below.
    value = path.lstat()
    if path.resolve() != path or not path.is_dir() or path.is_symlink():
        raise ValueError('Original directory required')
    return value


def windows_file(path):
    value = path.lstat()
    if path.resolve() != path or not path.is_file() or path.is_symlink() or value.st_nlink != 1:
        raise ValueError('Original file required')
    return path.read_bytes(), value


class ManagedExpiryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        os.chmod(self.root, 0o700)
        self.uid = patch.object(expiry, 'UID', getattr(os, 'getuid', lambda: 0)())
        self.uid.start()
        self.windows = []
        if os.name == 'nt':
            self.windows = [patch.object(expiry, 'directory', side_effect=windows_directory),
                            patch.object(expiry, 'original_file', side_effect=windows_file)]
            for helper in self.windows:
                helper.start()

    def tearDown(self):
        for helper in self.windows:
            helper.stop()
        self.uid.stop()
        self.temporary.cleanup()

    def test_exact_expiry_is_due_and_check_never_deletes(self):
        due, a = fixture(self.root, NOW - dt.timedelta(days=7))
        fresh, b = fixture(self.root, NOW - dt.timedelta(days=7) + dt.timedelta(seconds=1))
        result = expiry.expire(self.root, {due.name: a, fresh.name: b}, PROJECT, NOW)
        self.assertEqual(result['expiredArchives'], 1)
        self.assertEqual(result['removedArchives'], 0)
        self.assertTrue(due.exists() and fresh.exists())
        self.assertFalse(result['localCopiesExpired'] or result['serviceActivationAllowed'])

    @unittest.skipIf(os.name == 'nt', 'Linux descriptor-relative unlink; Windows verifies read-only planning')
    def test_apply_deletes_only_due_complete_archive_and_does_not_extend_last_copy(self):
        due, a = fixture(self.root, NOW - dt.timedelta(days=7))
        fresh, b = fixture(self.root, NOW)
        result = expiry.expire(self.root, {due.name: a, fresh.name: b}, PROJECT, NOW, apply=True)
        self.assertEqual(result['removedArchives'], 1)
        self.assertFalse(due.exists())
        self.assertEqual({p.name for p in fresh.iterdir()}, expiry.FILES)
        result = expiry.expire(self.root, {fresh.name: b}, PROJECT, NOW + dt.timedelta(days=8), apply=True)
        self.assertEqual(result['removedArchives'], 1)
        self.assertEqual(list(self.root.iterdir()), [])

    def test_corrupt_fresh_ciphertext_blocks_whole_batch_before_old_deletion(self):
        due, a = fixture(self.root, NOW - dt.timedelta(days=8))
        fresh, b = fixture(self.root, NOW)
        (fresh / 'catalog.json.age').write_bytes(b'corrupt')
        with self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: a, fresh.name: b}, PROJECT, NOW, apply=True)
        self.assertTrue(due.exists())

    def test_incomplete_foreign_or_unattested_batch_cannot_delete(self):
        due, a = fixture(self.root, NOW - dt.timedelta(days=8))
        for expected in [{}, {due.name: {**a, 'sourceCommit': 'c' * 40}}]:
            with self.assertRaises(ValueError):
                expiry.expire(self.root, expected, PROJECT, NOW, apply=True)
        extra = due / 'foreign.txt'
        extra.write_text('unrelated')
        with self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: a}, PROJECT, NOW, apply=True)
        extra.unlink()
        (due / 'catalog.json.age').unlink()
        with self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: a}, PROJECT, NOW, apply=True)
        self.assertTrue(due.exists())

    def test_wrong_project_time_scope_or_file_set_fails(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        for change in [
            {'projectBinding': 'c' * 64}, {'schemaVersion': 'contabo-backup-1'},
            {'capturedAt': NOW.replace(tzinfo=None).isoformat()},
            {'capturedAt': (NOW + dt.timedelta(hours=1)).isoformat()},
            {'expiresAt': (NOW + dt.timedelta(days=30)).isoformat()},
            {'scope': 'daily'}, {'publicDataIncluded': True},
            {'restoreOrActivationAllowed': True},
            {'ephemeralStorageUploadDataExcludedAtCapture': False},
            {'encryptedFiles': {}},
        ]:
            with self.subTest(change=change), self.assertRaises((ValueError, TypeError)):
                expiry.validate_manifest({**manifest, **change}, due.name, PROJECT, NOW)

    def test_hardlinked_ciphertext_is_refused(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        alias = self.root / 'outside-link'
        os.link(due / 'managed.dump.age', alias)
        # A second ciphertext name must be refused even with matching content.
        with self.assertRaises(ValueError):
            expiry.original_file(due / 'managed.dump.age')

    def test_permission_or_type_failure_precedes_content_read(self):
        path = Mock(spec=Path)
        path.resolve.return_value = path
        for change in [{'st_uid': 123456}, {'st_nlink': 2},
                       {'st_mode': stat.S_IFREG | 0o644}, {'st_mode': stat.S_IFLNK | 0o600},
                       {'st_size': 128 * 1024**2 + 1}]:
            path.lstat.return_value = types.SimpleNamespace(
                **{'st_uid': expiry.UID, 'st_nlink': 1, 'st_mode': stat.S_IFREG | 0o600,
                   'st_size': 10, **change})
            # Invoke the production reader even on Windows, bypassing its test-only adapter.
            with self.assertRaises(ValueError):
                original_reader(path)
            path.open.assert_not_called()

    def test_changed_batch_between_plan_and_apply_fails_without_deletion(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        original = expiry.inventory
        calls = 0

        def changed(*args):
            nonlocal calls
            calls += 1
            if calls == 2:
                (due / 'unexpected.txt').write_text('concurrent operator')
            return original(*args)

        with patch.object(expiry, 'inventory', side_effect=changed), self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: manifest}, PROJECT, NOW, apply=True)
        self.assertTrue((due / 'managed.dump.age').exists())


original_reader = expiry.original_file

if __name__ == '__main__':
    unittest.main()
