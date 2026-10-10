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
spec = importlib.util.spec_from_file_location('daily_installer', directory / 'contabo-daily-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
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
    def test_edge_probe_identifies_itself_and_requires_exact_login_gate(self):
        import urllib.error
        from unittest.mock import Mock
        team = 'fixture.cloudflareaccess.com'
        opener = Mock()
        for status, host, cache, accepted in [(302, team, '', True),
                (302, 'wrong.invalid', '', False), (302, team, 'HIT', False),
                (403, team, '', False)]:
            opener.open.side_effect = urllib.error.HTTPError('https://alterward.com/discover',
                status, 'fixture', {'Location': 'https://' + host + '/cdn-cgi/access/login/alterward.com',
                                    'CF-Cache-Status': cache}, None)
            with patch.object(daily.urllib.request, 'build_opener', return_value=opener):
                self.assertEqual(daily.edge_closed(team), accepted)
            request = opener.open.call_args.args[0]
            self.assertEqual(request.get_header('User-agent'), 'Alterward-Release-Verification/1')

    def test_database_tls_comes_from_actual_frozen_api_environment(self):
        source = b"DATABASE_URL='postgresql://fixture_user:fixture_pass@fixture.invalid:5432/postgres'\n"
        actual = {'services': {'api': {'environment': {'DATABASE_SSL': 'true'}}}}
        with patch.object(daily, 'regular', side_effect=lambda p: source if p.name == 'server.env' else json.dumps(actual).encode()):
            self.assertEqual(daily.owner_database()['host'], 'fixture.invalid')
            actual['services']['api']['environment']['DATABASE_SSL'] = 'false'
            with self.assertRaises(ValueError):
                daily.owner_database()

    def test_web_has_no_provider_configuration_api_and_worker_require_zero_budget(self):
        self.assertTrue(daily.owner_only_environment('web', {}))
        self.assertFalse(daily.owner_only_environment('api', {}))
        env = {'AI_PROJECT_BUDGET_USD': '0', 'AI_USER_BUDGET_USD': '0',
               'OPENAI_API_KEY': 'alterward_owner_provider_access_disabled'}
        self.assertTrue(daily.owner_only_environment('api', {k: v for k, v in env.items() if k != 'OPENAI_API_KEY'}))
        self.assertFalse(daily.owner_only_environment('api', env))
        self.assertTrue(daily.owner_only_environment('worker', env))
        self.assertFalse(daily.owner_only_environment('web', env))
        self.assertFalse(daily.owner_only_environment('worker', {**env, 'AI_PROJECT_BUDGET_USD': '1'}))

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


class DailyActivationTests(unittest.TestCase):
    def setUp(self):
        self.config = {'sourceCommit': 'a' * 40, 'scriptHashes': {'contabo-daily.py': 'b' * 64},
                       'unitHashes': {'alterward-backup.service': 'c' * 64}}
        self.proof = {**self.config, 'capturedAt': NOW.isoformat(), 'ok': True}
        self.clock = patch.object(daily, 'utcnow', return_value=NOW)
        self.clock.start()

    def tearDown(self):
        self.clock.stop()

    def test_source_hash_unit_hash_and_age_are_all_required(self):
        self.assertTrue(daily.current_proof(self.proof, self.config, 1800))
        for field in ['sourceCommit', 'scriptHashes', 'unitHashes']:
            with self.subTest(field=field):
                self.assertFalse(daily.current_proof({**self.proof, field: None}, self.config, 1800))
        for timestamp in [(NOW - dt.timedelta(seconds=1801)).isoformat(),
                          (NOW + dt.timedelta(seconds=1)).isoformat(), 'broken', NOW.replace(tzinfo=None).isoformat()]:
            self.assertFalse(daily.current_proof({**self.proof, 'capturedAt': timestamp}, self.config, 1800))

    def test_status_does_not_present_old_success_as_current(self):
        from unittest.mock import Mock
        path = Mock()
        path.exists.return_value = True
        path.__truediv__ = Mock(return_value=path)
        stale = {**self.proof, 'capturedAt': (NOW - dt.timedelta(days=2)).isoformat()}
        with patch.object(daily, 'ROOT', path), patch.object(daily, 'regular', return_value=json.dumps(stale).encode()):
            result = daily.status_snapshot(self.config)
        self.assertFalse(result['backup']['ok'])
        self.assertFalse(result['monitor']['ok'])

    def test_runtime_directory_is_created_by_systemd_and_preserved_between_jobs(self):
        for name, content in installer.unit_files().items():
            if name.endswith('.service'):
                self.assertIn('RuntimeDirectory=alterward-daily-work\n', content)
                self.assertIn('RuntimeDirectoryMode=0700\n', content)
                self.assertIn('RuntimeDirectoryPreserve=yes\n', content)
                self.assertIn(daily.WORK.as_posix(), content)
                self.assertNotIn('/dev/shm/alterward-daily-work', content)

    def test_fabricated_or_previous_source_restore_proof_never_enables_units(self):
        from contextlib import nullcontext
        from unittest.mock import Mock
        mock = Mock()
        mock.ROOT = daily.ROOT
        mock.OWNER = daily.OWNER
        mock.config.return_value = self.config
        mock.exclusive.side_effect = lambda _: nullcontext()
        mock.status_snapshot.return_value = {'backup': {**self.proof, 'runId': 'fixture', 'tables': 97}, 'monitor': self.proof}
        mock.current_proof.side_effect = daily.current_proof
        restored = {**self.proof, 'runId': 'fixture', 'encryptedFiles': {'config': 'hash'},
                    'offsiteCiphertextVerified': True, 'tamperedCiphertextRejected': True,
                    'tablesRestoredAndDataMatched': 97, 'temporaryContainersRemoved': True, 'temporaryPlaintextRemoved': True}
        mock.regular.return_value = json.dumps(restored).encode()
        with patch.object(installer, 'installed_daily', return_value=mock), patch.object(installer, 'run') as command, patch.object(installer.os, 'geteuid', return_value=0, create=True):
            for altered in [{**restored, 'sourceCommit': 'd' * 40}, {**restored, 'encryptedFiles': {'config': 'fabricated'}}]:
                with self.assertRaises(ValueError):
                    installer.main({'action': 'activate', 'restoreProof': altered})
            command.assert_not_called()

    def test_valid_fresh_root_record_allows_only_dedicated_timers(self):
        from contextlib import nullcontext
        from unittest.mock import Mock
        mock = Mock()
        mock.OWNER = daily.OWNER
        mock.config.return_value = self.config
        mock.exclusive.side_effect = lambda _: nullcontext()
        mock.status_snapshot.return_value = {'backup': {**self.proof, 'runId': 'fixture', 'tables': 97}, 'monitor': self.proof}
        mock.current_proof.side_effect = daily.current_proof
        restored = {**self.proof, 'runId': 'fixture', 'encryptedFiles': {'config': 'hash'},
                    'offsiteCiphertextVerified': True, 'tamperedCiphertextRejected': True,
                    'tablesRestoredAndDataMatched': 97, 'temporaryContainersRemoved': True, 'temporaryPlaintextRemoved': True}
        mock.regular.return_value = json.dumps(restored).encode()
        mock.stable_state.return_value = {'unchanged': True}
        with patch.object(installer, 'installed_daily', return_value=mock), patch.object(installer, 'run') as command, patch.object(installer.os, 'geteuid', return_value=0, create=True):
            self.assertTrue(installer.main({'action': 'activate', 'restoreProof': restored})['timersActivated'])
            command.assert_called_once_with(['systemctl', 'enable', '--now', 'alterward-backup.timer', 'alterward-monitor.timer'])
        self.assertEqual(mock.exclusive.call_count, 2)

    def test_inventory_refuses_overlapping_backup_before_reading_pending_archives(self):
        from unittest.mock import Mock
        mock = Mock()
        mock.exclusive.side_effect = BlockingIOError('busy')
        with patch.object(installer, 'installed_daily', return_value=mock), patch.object(installer.os, 'geteuid', return_value=0, create=True):
            with self.assertRaises(BlockingIOError):
                installer.main({'action': 'inventory'})
        mock.completed_archives.assert_not_called()
        mock.clean_pending.assert_not_called()

    def test_stale_failure_preserves_the_actual_failure_alert(self):
        from unittest.mock import Mock
        path = Mock()
        path.exists.return_value = True
        path.__truediv__ = Mock(return_value=path)
        failed = {**self.proof, 'ok': False, 'alerts': ['backup_operation_failed'],
                  'capturedAt': (NOW - dt.timedelta(days=2)).isoformat()}
        with patch.object(daily, 'ROOT', path), patch.object(daily, 'regular', return_value=json.dumps(failed).encode()):
            self.assertEqual(daily.status_snapshot(self.config)['backup']['alerts'],
                             ['backup_operation_failed', 'backup_stale_or_source_changed'])

    def test_restore_identity_uses_memory_root_and_cleanup_even_on_exception(self):
        from types import SimpleNamespace
        original = library.ROOT, library.LABEL, library.age_path
        def rehearsal(_):
            self.assertEqual(library.ROOT, daily.WORK)
            self.assertEqual(library.LABEL, daily.RESTORE_LABEL)
            self.assertTrue(Path(library.age_path()).as_posix().endswith('tools/usr/bin/age'))
            raise RuntimeError('interrupted-fixture')
        with patch.object(daily, 'clean_work') as cleanup, patch.object(daily.shutil, 'disk_usage', return_value=SimpleNamespace(free=1024**3)), patch.object(library, 'rehearse', side_effect=rehearsal):
            with self.assertRaises(RuntimeError):
                daily.rehearse_offsite({})
            self.assertEqual(cleanup.call_count, 2)
        self.assertEqual((library.ROOT, library.LABEL, library.age_path), original)


if __name__ == '__main__':
    unittest.main()
