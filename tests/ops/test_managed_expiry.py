import datetime as dt
import contextlib
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

    def test_main_refuses_unknown_keys_nonroot_and_clock_skew_before_locks(self):
        request = {'mode': 'check', 'projectBinding': PROJECT, 'expectedManifests': {},
                   'clientObservedAt': NOW.isoformat()}
        for change in [{'root': '/some/other/root'}, {'mode': 'other'},
                       {'clientObservedAt': NOW.replace(tzinfo=None).isoformat()},
                       {'clientObservedAt': (NOW + dt.timedelta(seconds=301)).isoformat()},
                       {'clientObservedAt': (NOW - dt.timedelta(seconds=301)).isoformat()}]:
            with patch.object(os, 'geteuid', return_value=expiry.UID, create=True), \
                    patch.object(expiry, 'utc_now', return_value=NOW), \
                    patch.object(expiry, 'operator_locks') as locks, self.assertRaises(ValueError):
                expiry.main({**request, **change})
            locks.assert_not_called()
        with patch.object(os, 'geteuid', return_value=expiry.UID + 1, create=True), \
                patch.object(expiry, 'operator_locks') as locks, self.assertRaises(ValueError):
            expiry.main(request)
        locks.assert_not_called()

    def test_main_requires_expiry_on_both_clocks_and_valid_clock_enters_locks(self):
        request = {'mode': 'check', 'projectBinding': PROJECT, 'expectedManifests': {},
                   'clientObservedAt': (NOW - dt.timedelta(seconds=120)).isoformat()}
        for server_clock, client_clock in [(NOW, NOW - dt.timedelta(seconds=120)),
                                           (NOW - dt.timedelta(seconds=120), NOW)]:
            request['clientObservedAt'] = client_clock.isoformat()
            entered = []

            @contextlib.contextmanager
            def locks():
                entered.append(True)
                yield

            with patch.object(os, 'geteuid', return_value=expiry.UID, create=True), \
                    patch.object(expiry, 'utc_now', return_value=server_clock), \
                    patch.object(expiry, 'operator_locks', side_effect=locks), \
                    patch.object(expiry, 'expire', return_value={}) as run:
                result = expiry.main(request)
            self.assertEqual(entered, [True])
            self.assertEqual(run.call_args.args[3], min(server_clock, client_clock))
            self.assertTrue(result['bothClocksPastExpiryRequired'])

    @unittest.skipIf(os.name == 'nt', 'Linux root descriptor guard')
    def test_replaced_root_after_recheck_cannot_delete(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        real_open = os.open

        def swapped(path, flags, *args, **kwargs):
            if path == self.root:
                replacement = self.root / 'replacement-root'
                replacement.mkdir(mode=0o700)
                return real_open(replacement, flags, *args, **kwargs)
            return real_open(path, flags, *args, **kwargs)

        with patch.object(os, 'open', side_effect=swapped), self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: manifest}, PROJECT, NOW, apply=True)
        self.assertTrue((due / 'managed.dump.age').exists())

    @unittest.skipIf(os.name == 'nt', 'Linux O_NOFOLLOW archive descriptor guard')
    def test_archive_symlink_swap_after_stat_cannot_delete(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        real_open = os.open
        held = self.root / (due.name + '-held')

        def swapped(path, flags, *args, **kwargs):
            if path == due.name and kwargs.get('dir_fd') is not None:
                due.rename(held)
                due.symlink_to(held, target_is_directory=True)
            return real_open(path, flags, *args, **kwargs)

        with patch.object(os, 'open', side_effect=swapped), self.assertRaises(OSError):
            expiry.expire(self.root, {due.name: manifest}, PROJECT, NOW, apply=True)
        self.assertTrue((held / 'managed.dump.age').exists())

    @unittest.skipIf(os.name == 'nt', 'Linux descriptor-relative last-moment file guard')
    def test_file_replaced_after_recheck_blocks_all_unlinks(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        real_stat = os.stat
        changed = False

        def swapped(path, *args, **kwargs):
            nonlocal changed
            if path == 'catalog.json.age' and kwargs.get('dir_fd') is not None and not changed:
                changed = True
                original = due / 'catalog.json.age'
                data = original.read_bytes()
                original.rename(due / 'original-catalog')
                original.write_bytes(data)
                original.chmod(0o600)
            return real_stat(path, *args, **kwargs)

        with patch.object(os, 'stat', side_effect=swapped), self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: manifest}, PROJECT, NOW, apply=True)
        self.assertTrue(changed)
        self.assertTrue((due / 'managed.dump.age').exists() and (due / 'manifest.json').exists())

    @unittest.skipIf(os.name == 'nt', 'Linux descriptor-relative directory-removal guard')
    def test_replaced_directory_before_rmdir_preserves_foreign_replacement(self):
        due, manifest = fixture(self.root, NOW - dt.timedelta(days=8))
        real_unlink = os.unlink
        held = self.root / (due.name + '-held')

        def swapped(path, *args, **kwargs):
            result = real_unlink(path, *args, **kwargs)
            if path == 'manifest.json' and kwargs.get('dir_fd') is not None:
                due.rename(held)
                due.mkdir(mode=0o700)
                (due / 'foreign-data').write_text('preserve this synthetic replacement')
            return result

        with patch.object(os, 'unlink', side_effect=swapped), self.assertRaises(ValueError):
            expiry.expire(self.root, {due.name: manifest}, PROJECT, NOW, apply=True)
        self.assertTrue((due / 'foreign-data').exists() and held.exists())

    @unittest.skipIf(os.name == 'nt', 'Linux actual flock contention and release')
    def test_both_lock_contentions_fail_and_release_previously_acquired_lock(self):
        import fcntl
        locks = (self.root / 'job.lock', self.root / 'activation.lock')
        for path in locks:
            path.write_bytes(b'')
            path.chmod(0o600)
        for held in locks:
            with held.open('r+b') as handle, patch.object(expiry, 'LOCK_PATHS', locks):
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaises(BlockingIOError):
                    with expiry.operator_locks():
                        self.fail('Cannot acquire a held lock')
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
                with expiry.operator_locks():
                    pass


original_reader = expiry.original_file

if __name__ == '__main__':
    unittest.main()
