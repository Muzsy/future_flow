"""Recovery ordering, independent clock, freshness and source boundaries."""
import contextlib
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

source = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-recovery-lifecycle.py'
spec = importlib.util.spec_from_file_location('recovery_lifecycle', source)
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)
NOW = dt.datetime(2026, 10, 10, 21, tzinfo=dt.timezone.utc)
CONFIG = {'sourceCommit': 'a' * 40, 'scriptHashes': {}, 'unitHashes': {},
          'projectBinding': hashlib.sha256(('a' * 20).encode()).hexdigest()}


class RecoveryLifecycleTests(unittest.TestCase):
    def test_independent_clock_uses_earlier_and_refuses_stale_or_wrong_timezone(self):
        self.assertEqual(recovery.decision_clock(NOW, 'Sat, 10 Oct 2026 20:59:59 GMT'), NOW-dt.timedelta(seconds=1))
        self.assertEqual(recovery.decision_clock(NOW, 'Sat, 10 Oct 2026 21:00:01 GMT'), NOW)
        for date in ['Sat, 10 Oct 2026 20:54:59 GMT', 'Sat, 10 Oct 2026 21:05:01 GMT',
                     'Sat, 10 Oct 2026 21:00:00 +0200', 'invalid']:
            with self.subTest(date=date), self.assertRaises((ValueError, TypeError)):
                recovery.decision_clock(NOW, date)

    def test_capture_clock_boundaries(self):
        self.assertTrue(recovery.capture_due(None, NOW))
        for age, due in [(0, False), (22.999, False), (23, True), (48, True)]:
            self.assertEqual(recovery.capture_due({'lastCaptureAt': (NOW-dt.timedelta(hours=age)).isoformat()}, NOW), due)
        with self.assertRaises(ValueError):
            recovery.capture_due({'lastCaptureAt': (NOW+dt.timedelta(seconds=1)).isoformat()}, NOW)

    def environment(self, previous=None, backup_ok=True):
        api = {'Id': 'own-api', 'Config': {'Env': ['SUPABASE_URL=https://' + 'a'*20 + '.supabase.co']}}
        daily = Mock()
        daily.owner_runtime.return_value = ({}, {'api': api})
        daily.config.return_value = {'recipient': 'age1'+'a'*58, 'postgresImage': 'sha256:'+'b'*64}
        daily.utcnow.return_value = NOW
        daily.stable_state.return_value = {'foreign': 'unchanged', 'own': 'unchanged'}
        daily.owner_database.return_value = {'password': 'private-fixture-secret'}
        daily.status_snapshot.return_value = {'backup': {'ok': backup_ok}}
        daily.current_proof.return_value = backup_ok
        manifest = {'runId': '20261010T210000Z-12345678', 'capturedAt': NOW.isoformat()}
        if previous:
            manifest = {'runId': previous['lastRunId'], 'capturedAt': previous['lastCaptureAt']}
        expiry = Mock()
        expiry.ROOT = Path('/unused/managed')
        expiry.catalog.return_value = {'expectedManifests': {manifest['runId']: manifest}, 'freshRuns': [manifest['runId']]}
        expiry.expire.return_value = {'removedArchives': 0}
        managed = Mock()
        managed.capture.return_value = manifest
        legacy = Mock()
        legacy.local_lock.side_effect = lambda *_: contextlib.nullcontext()
        legacy.expire.return_value = {'filesRemoved': 0}
        stack = contextlib.ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.object(recovery, 'clean_work'))
        stack.enter_context(patch.object(recovery, 'previous_status', return_value=previous))
        stack.enter_context(patch.object(recovery, 'independent_clock', return_value=NOW))
        stack.enter_context(patch.object(recovery, 'snapshot', return_value=contextlib.nullcontext({'catalog': {}, 'snapshot': 'exact'})))
        stack.enter_context(patch.object(recovery, 'persist_capture'))
        stack.enter_context(patch.object(recovery.Path, 'read_text', return_value='fixture-ca'))
        return daily, expiry, legacy, managed

    def test_first_capture_is_durable_before_historical_expiry(self):
        daily, expiry, legacy, managed = self.environment()
        def check_prior(*args):
            self.assertTrue(daily.atomic.called)
            self.assertEqual(daily.atomic.call_args.args[1]['lastRunId'], managed.capture.return_value['runId'])
            return {'filesRemoved': 0}
        legacy.expire.side_effect = check_prior
        result = recovery.perform(CONFIG, daily, expiry, legacy, managed)
        self.assertTrue(result['capturedThisRun'])
        self.assertEqual(result['paidAiCalls'], 0)
        self.assertNotIn('private-fixture-secret', json.dumps(result))
        self.assertFalse(result['automaticRestoreAllowed'])

    def test_fresh_capture_not_regenerated_and_expiry_runs(self):
        previous = {'lastCaptureAt': (NOW-dt.timedelta(hours=1)).isoformat(), 'lastRunId': '20261010T200000Z-12345678'}
        daily, expiry, legacy, managed = self.environment(previous)
        value = recovery.perform(CONFIG, daily, expiry, legacy, managed)
        managed.capture.assert_not_called()
        expiry.expire.assert_called_once()
        legacy.expire.assert_called_once()
        self.assertEqual(value['lastCaptureAt'], previous['lastCaptureAt'])

    def test_invalid_managed_inventory_stops_before_capture_or_historical_delete(self):
        daily, expiry, legacy, managed = self.environment()
        expiry.catalog.side_effect = ValueError('invalid archive')
        with self.assertRaises(ValueError):
            recovery.perform(CONFIG, daily, expiry, legacy, managed)
        managed.capture.assert_not_called();legacy.expire.assert_not_called()

    def test_missing_application_backup_blocks_historical_expiry(self):
        daily, expiry, legacy, managed = self.environment(backup_ok=False)
        with self.assertRaises(ValueError):
            recovery.perform(CONFIG, daily, expiry, legacy, managed)
        legacy.expire.assert_not_called()
        self.assertTrue(daily.atomic.called)  # Completed capture remains recoverable.

    def test_wrong_project_stops_all_capture_and_expiry(self):
        daily, expiry, legacy, managed = self.environment()
        with self.assertRaises(ValueError):
            recovery.perform({**CONFIG, 'projectBinding': 'f'*64}, daily, expiry, legacy, managed)
        expiry.catalog.assert_not_called();managed.capture.assert_not_called();legacy.expire.assert_not_called()

    def test_foreign_container_change_prevents_success(self):
        daily, expiry, legacy, managed = self.environment()
        daily.stable_state.side_effect = [{}, {'foreign': 'changed'}]
        with self.assertRaises(ValueError):
            recovery.perform(CONFIG, daily, expiry, legacy, managed)

    def test_capture_failure_never_deletes_historical_and_always_cleans_work(self):
        daily, expiry, legacy, managed = self.environment()
        managed.capture.side_effect = ValueError('secret raw exception suppressed')
        with patch.object(recovery, 'clean_work') as clean:
            with self.assertRaises(ValueError):
                recovery.perform(CONFIG, daily, expiry, legacy, managed)
            self.assertEqual(clean.call_count, 2)
        legacy.expire.assert_not_called()

    def test_lock_contention_does_not_refresh_or_replace_status(self):
        daily, expiry, legacy, managed = self.environment()
        expiry.operator_locks.side_effect = BlockingIOError()
        with patch.object(recovery.os, 'geteuid', return_value=0, create=True), patch.object(recovery, 'load', return_value=(CONFIG, daily, expiry, legacy, managed)):
            result = recovery.main()
        self.assertTrue(result['skippedBusy']);daily.atomic.assert_not_called()

    def test_failed_operation_retains_original_capture_and_records_failure(self):
        previous = {'lastCaptureAt': NOW.isoformat(), 'lastRunId': '20261010T210000Z-12345678'}
        daily, expiry, legacy, managed = self.environment(previous)
        expiry.operator_locks.side_effect = lambda: contextlib.nullcontext()
        with patch.object(recovery.os, 'geteuid', return_value=0, create=True), patch.object(recovery, 'load', return_value=(CONFIG, daily, expiry, legacy, managed)), patch.object(recovery, 'perform', side_effect=ValueError('private')):
            with self.assertRaises(ValueError):
                recovery.main()
        failed = daily.atomic.call_args.args[1]
        self.assertFalse(failed['ok'])
        self.assertEqual(failed['lastCaptureAt'], previous['lastCaptureAt'])
        self.assertNotIn('private', json.dumps(failed))


@unittest.skipIf(os.name == 'nt', 'Actual Linux cleanup and publication filesystem')
class RecoveryFilesystemTests(unittest.TestCase):
    def setUp(self):
        import test_contabo_daily
        self.daily = test_contabo_daily.daily
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name).resolve()
        self.root = self.home / 'ops';self.work = self.home / 'work'
        self.root.mkdir(mode=0o700);self.work.mkdir(mode=0o700)
        self.managed = types.SimpleNamespace(RUN_ID=re.compile(r'[0-9]{8}T[0-9]{6}Z-[a-f0-9]{8}'),
            FILES={'managed.dump.age', 'catalog.json.age'}, PINNED_PG='sha256:'+'b'*64)
        self.stack = contextlib.ExitStack()
        self.stack.enter_context(patch.object(recovery, 'ROOT', self.root))
        self.stack.enter_context(patch.object(recovery, 'WORK', self.work))
        self.stack.enter_context(patch.object(self.daily, 'UID', os.getuid()))
        self.stack.enter_context(patch.object(self.daily, 'command', return_value=b'tmpfs'))
        self.stack.enter_context(patch.object(self.daily, 'containers', return_value=[]))

    def tearDown(self):
        self.stack.close();self.temporary.cleanup()

    def file(self, path, content=b'synthetic private scratch'):
        path.write_bytes(content);path.chmod(0o600)

    def test_abandoned_plaintext_and_pending_ciphertext_cleaned_without_foreign_mutation(self):
        source = self.work / 'alterward-managed-fixture';source.mkdir(mode=0o700)
        self.file(source / 'pgpass');self.file(source / 'client.env')
        pending = self.root / 'pending-20261010T210000Z-12345678';pending.mkdir(mode=0o700)
        self.file(pending / 'managed.dump.age')
        foreign = self.root / 'config.json';self.file(foreign, b'original configuration')
        recovery.clean_work(self.daily, self.managed)
        self.assertEqual(list(self.work.iterdir()), [])
        self.assertFalse(pending.exists())
        self.assertEqual(foreign.read_bytes(), b'original configuration')

    def test_symlink_or_foreign_pending_file_blocks_entire_cleanup(self):
        scratch = self.work / 'pgpass';self.file(scratch)
        pending = self.root / 'pending-20261010T210000Z-12345678';pending.mkdir(mode=0o700)
        self.file(pending / 'foreign.txt')
        with self.assertRaises(ValueError):
            recovery.clean_work(self.daily, self.managed)
        self.assertTrue(scratch.exists())
        (pending / 'foreign.txt').unlink();pending.rmdir()
        target = self.root / 'target';self.file(target)
        (self.work / 'linked').symlink_to(target)
        with self.assertRaises(ValueError):
            recovery.clean_work(self.daily, self.managed)
        self.assertTrue(scratch.exists());self.assertTrue(target.exists())

    def test_unrelated_container_with_label_blocks_cleanup_before_plaintext_delete(self):
        scratch = self.work / 'pgpass';self.file(scratch)
        with patch.object(self.daily, 'containers', return_value=[{'Config': {'Labels': {recovery.LABEL: 'wrong'}}}]):
            with self.assertRaises(ValueError):
                recovery.clean_work(self.daily, self.managed)
        self.assertTrue(scratch.exists())

    def test_complete_ciphertext_bundle_atomic_publication_and_original_deadline(self):
        stage = self.work / 'stage';stage.mkdir(mode=0o700)
        run = '20261010T210000Z-12345678'
        path = stage / run;path.mkdir(mode=0o700)
        encrypted = {}
        for name in self.managed.FILES:
            raw = b'synthetic ciphertext';self.file(path / name, raw)
            encrypted[name] = {'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        manifest = {'runId': run, 'capturedAt': NOW.isoformat(), 'encryptedFiles': encrypted}
        self.file(path / 'manifest.json', json.dumps(manifest).encode())
        target = self.home / 'managed';target.mkdir(mode=0o700)
        self.managed.ROOT = stage
        recovery.persist_capture(self.daily, types.SimpleNamespace(ROOT=target), self.managed, manifest)
        self.assertEqual(json.loads((target / run / 'manifest.json').read_bytes()), manifest)
        self.assertFalse((self.root / ('pending-' + run)).exists())
        with self.assertRaises(ValueError):
            recovery.persist_capture(self.daily, types.SimpleNamespace(ROOT=target), self.managed, manifest)
        self.assertEqual(json.loads((target / run / 'manifest.json').read_bytes()), manifest)


if __name__ == '__main__':
    unittest.main()
