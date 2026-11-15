"""Local-copy acknowledgement cannot clear a stale/failure or wrong inventory."""
import datetime as dt
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('recovery_install', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-recovery-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
NOW = dt.datetime(2026, 10, 10, 21, tzinfo=dt.timezone.utc)


class LocalAttestationTests(unittest.TestCase):
    def setUp(self):
        self.config = {'sourceCommit': 'a'*40, 'projectBinding': 'b'*64}
        self.request = {'action': 'record-local', 'ok': True, 'sourceCommit': 'c'*40,
                        'observedAt': NOW.isoformat(), 'managedArchives': 2, 'legacyPolicyDigest': 'd'*64}
        self.daily = Mock();self.daily.utcnow.return_value = NOW
        self.expiry = Mock();self.expiry.catalog.return_value = {'freshRuns': ['first', 'second']}
        self.legacy = Mock();self.legacy.expire.return_value = {'policyDigest': 'd'*64}

    def call(self, **update):
        return installer.local_attestation({**self.request, **update}, self.config, self.daily, self.expiry, self.legacy)

    def test_exact_fresh_attestation_is_bound_to_installed_source_not_new_timer_activation(self):
        value = self.call()
        self.assertTrue(value['ok'])
        self.assertEqual(value['installedSourceCommit'], self.config['sourceCommit'])
        self.assertEqual(value['localSourceCommit'], self.request['sourceCommit'])
        self.assertNotIn('timerActivated', value)

    def test_old_future_mistyped_private_or_wrong_inventory_refused(self):
        for update in [{'observedAt': (NOW-dt.timedelta(seconds=301)).isoformat()},
                       {'observedAt': (NOW+dt.timedelta(seconds=301)).isoformat()},
                       {'ok': 'true'}, {'managedArchives': True}, {'managedArchives': 0},
                       {'managedArchives': 1}, {'legacyPolicyDigest': 'e'*64},
                       {'privateKey': 'must not be accepted'}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                self.call(**update)

    def test_small_clock_drift_in_both_directions_tolerated(self):
        for drift in [-300, -2, 2, 300]:
            self.assertTrue(self.call(observedAt=(NOW+dt.timedelta(seconds=drift)).isoformat())['ok'])

    def test_failure_receipt_stays_failed_even_without_successful_inventory(self):
        value = self.call(ok=False, managedArchives=0, legacyPolicyDigest='0'*64)
        self.assertFalse(value['ok'])
        self.expiry.catalog.assert_not_called();self.legacy.expire.assert_not_called()

    def test_new_server_capture_between_copy_and_receipt_blocks_false_fresh_success(self):
        self.expiry.catalog.return_value = {'freshRuns': ['first', 'second', 'third']}
        with self.assertRaises(ValueError):
            self.call()


class LocalExpiryPreconditionsTests(unittest.TestCase):
    def setUp(self):
        self.config = {'sourceCommit': 'a'*40, 'projectBinding': 'b'*64}
        self.daily = Mock();self.daily.utcnow.return_value = NOW
        self.daily.status_snapshot.return_value = {'backup': {'ok':True, 'capturedAt': NOW.isoformat()}}
        self.daily.current_proof.return_value = True
        self.expiry = Mock()
        self.expiry.catalog.return_value = {'freshRuns':['run'], 'expectedManifests':{'run':{'capturedAt':NOW.isoformat()}}}

    def call(self):
        return installer.local_expiry_preconditions(self.config, self.daily, self.expiry)

    def test_authenticated_fresh_original_backups_allow_local_expiry(self):
        self.assertTrue(self.call()['localExpiryPreconditionsVerified'])
        self.daily.current_proof.assert_called_once_with(self.daily.status_snapshot.return_value['backup'], self.daily.config.return_value, 26*3600)

    def test_stale_or_future_managed_capture_refused(self):
        for offset in [-26*3600-1, 1]:
            self.expiry.catalog.return_value['expectedManifests']['run']['capturedAt']=(NOW+dt.timedelta(seconds=offset)).isoformat()
            with self.assertRaises(ValueError): self.call()

    def test_missing_managed_archive_refused(self):
        self.expiry.catalog.return_value['freshRuns']=[]
        with self.assertRaises(ValueError): self.call()

    def test_failed_application_backup_refused(self):
        self.daily.status_snapshot.return_value['backup']['ok']=False
        with self.assertRaises(ValueError): self.call()

    def test_stale_or_source_mismatched_application_backup_refused(self):
        self.daily.current_proof.return_value=False
        with self.assertRaises(ValueError): self.call()


if __name__ == '__main__':
    unittest.main()


class SourceUpdateTests(unittest.TestCase):
    """Compare-and-swap update of capture sources only; evidence is kept."""

    def setUp(self):
        import base64, hashlib, json, tempfile
        self.b64, self.sha, self.json = base64, hashlib, json
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'scripts').mkdir()
        self.old = {name: ('old ' + name).encode() for name in installer.SOURCES}
        for name, data in self.old.items():
            (self.root / 'scripts' / name).write_bytes(data)
        self.config = {'schemaVersion': 'alterward-recovery-lifecycle-1', 'sourceCommit': 'a'*40,
                       'projectBinding': 'b'*64,
                       'scriptHashes': {k: hashlib.sha256(v).hexdigest() for k, v in self.old.items()},
                       'unitHashes': {k: hashlib.sha256(v.encode()).hexdigest() for k, v in installer.units().items()}}
        (self.root / 'config.json').write_text(json.dumps(self.config))
        self.capture = {**{k: self.config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']},
                        'lastRunId': '20261104T050707Z-9854b433', 'lastCaptureAt': '2026-11-04T05:07:25+00:00'}
        (self.root / 'capture.json').write_text(json.dumps(self.capture))
        self.daily = Mock()
        self.daily.durable_file.side_effect = lambda path, data: path.write_bytes(data)
        self.daily.atomic.side_effect = lambda path, value: path.write_text(json.dumps(value))

    def tearDown(self):
        self.tmp.cleanup()

    def request(self, changes=None, **update):
        scripts = {**self.old, **(changes if changes is not None else {'managed.py': b'new managed'})}
        return {'action': 'update', 'sourceCommit': 'c'*40, 'previousSourceCommit': 'a'*40,
                'scripts': {k: self.b64.b64encode(v).decode() for k, v in scripts.items()}, **update}

    def test_capture_source_update_rebinds_config_and_capture_and_keeps_previous(self):
        plan = installer.update_sources(self.request(), self.config, self.root)
        result = installer.apply_update(plan, self.config, self.daily, self.root)
        self.assertEqual(result['changedScripts'], ['managed.py'])
        self.assertEqual((self.root / 'scripts/managed.py').read_bytes(), b'new managed')
        self.assertEqual((self.root / ('scripts-' + 'a'*40) / 'managed.py').read_bytes(), b'old managed.py')
        config = self.json.loads((self.root / 'config.json').read_text())
        self.assertEqual(config['sourceCommit'], 'c'*40)
        self.assertEqual(config['projectBinding'], 'b'*64)
        self.assertEqual(config['unitHashes'], self.config['unitHashes'])
        self.assertEqual(config['scriptHashes']['managed.py'], self.sha.sha256(b'new managed').hexdigest())
        capture = self.json.loads((self.root / 'capture.json').read_text())
        self.assertEqual(capture['lastRunId'], self.capture['lastRunId'])
        self.assertEqual(capture['lastCaptureAt'], self.capture['lastCaptureAt'])
        self.assertEqual({k: capture[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']},
                         {k: config[k] for k in ['sourceCommit', 'scriptHashes', 'unitHashes']})
        kept = self.json.loads((self.root / ('capture-' + 'a'*40 + '.json')).read_text())
        self.assertEqual(kept, self.capture)
        self.assertFalse((self.root / ('.update-' + 'c'*40)).exists())

    def test_wrong_previous_same_commit_extra_fields_or_missing_sources_refused(self):
        bad = [self.request(previousSourceCommit='d'*40), self.request(sourceCommit='a'*40),
               self.request(sourceCommit='C'*40), {**self.request(), 'projectBinding': 'e'*64}]
        partial = self.request(); partial['scripts'].pop('lifecycle.py'); bad.append(partial)
        for request in bad:
            with self.subTest(request=sorted(request)), self.assertRaises(ValueError):
                installer.update_sources(request, self.config, self.root)

    def test_retention_and_expiry_sources_never_change_in_an_update(self):
        for name in ['expiry.py', 'local.py', 'legacy.py']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                installer.update_sources(self.request({'managed.py': b'new', name: b'new policy'}), self.config, self.root)
        with self.assertRaises(ValueError):  # Nothing to update.
            installer.update_sources(self.request({}), self.config, self.root)

    def test_unit_drift_or_leftover_update_evidence_refused(self):
        drifted = {**self.config, 'unitHashes': {k: '0'*64 for k in self.config['unitHashes']}}
        with self.assertRaises(ValueError):
            installer.update_sources(self.request(), drifted, self.root)
        for leftover in ['.update-' + 'c'*40, 'scripts-' + 'a'*40]:
            (self.root / leftover).mkdir()
            with self.subTest(leftover=leftover), self.assertRaises(ValueError):
                installer.update_sources(self.request(), self.config, self.root)
            (self.root / leftover).rmdir()

    def test_failed_config_write_restores_previous_sources_capture_and_config(self):
        plan = installer.update_sources(self.request(), self.config, self.root)
        original_atomic = self.daily.atomic.side_effect
        def failing(path, value):
            if path.name == 'config.json' and value['sourceCommit'] == 'c'*40:
                raise OSError('disk full')
            original_atomic(path, value)
        self.daily.atomic.side_effect = failing
        with self.assertRaises(OSError):
            installer.apply_update(plan, self.config, self.daily, self.root)
        self.assertEqual((self.root / 'scripts/managed.py').read_bytes(), b'old managed.py')
        self.assertEqual(self.json.loads((self.root / 'config.json').read_text()), self.config)
        self.assertEqual(self.json.loads((self.root / 'capture.json').read_text()), self.capture)
        self.assertFalse((self.root / ('scripts-' + 'a'*40)).exists())
        self.assertFalse((self.root / ('.update-' + 'c'*40)).exists())
        self.assertFalse((self.root / ('capture-' + 'a'*40 + '.json')).exists())
        self.daily.atomic.side_effect = original_atomic  # A clean retry succeeds.
        retry = installer.update_sources(self.request(), self.config, self.root)
        self.assertTrue(installer.apply_update(retry, self.config, self.daily, self.root)['updated'])
