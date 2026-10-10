"""Read-only synthetic projection; no actual service, credential or status read."""
import contextlib
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-health-projection.py'
spec = importlib.util.spec_from_file_location('health_projection', SOURCE)
health = importlib.util.module_from_spec(spec)
spec.loader.exec_module(health)
NOW = dt.datetime(2026, 10, 10, 17, 0, tzinfo=dt.timezone.utc)


@unittest.skipIf(os.name == 'nt', 'Linux forced-command reader')
class HealthProjectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.units = self.root / 'units'
        for name in ('units', 'scripts', 'status'):
            (self.root / name).mkdir(mode=0o700)
        self.owner = patch.object(health, 'UID', os.getuid())
        self.owner.start()
        def source_hashes(names, directory):
            for name in names:
                self.write(directory / name, b'synthetic source')
            return {name: hashlib.sha256(b'synthetic source').hexdigest() for name in names}
        self.config = {
            'schemaVersion': 'alterward-daily-1', 'retentionSeconds': 7 * 86400,
            'sourceCommit': 'a' * 40,
            'scriptHashes': source_hashes(health.SCRIPTS, self.root / 'scripts'),
            'unitHashes': source_hashes(health.UNITS, self.units),
            'recipient': 'private-only-value-not-projected',
        }
        binding = {k: self.config[k] for k in ('sourceCommit', 'scriptHashes', 'unitHashes')}
        self.monitor = {'ok': True, **binding, 'capturedAt': NOW.isoformat(), 'health': {
            'ownerHealthy': True, 'pendingJobs': 0, 'databaseTlsVerified': True,
            'edgeClosed': True, 'anonymousDenied': 4, 'lastBackupAt': NOW.isoformat(),
            'backupFailed': False, 'diskFreeBytes': 3 * 1024**3,
            'originCertificateOver30Days': True, 'privateCustomer': 'not-projected',
        }}
        self.backup = {'ok': True, **binding, 'capturedAt': NOW.isoformat()}
        self.persist()

    def tearDown(self):
        self.owner.stop()
        self.temporary.cleanup()

    def write(self, path, value):
        path.write_bytes(value if isinstance(value, bytes) else json.dumps(value).encode())
        path.chmod(0o600)

    def persist(self):
        for path, value in [('config.json', self.config), ('status/monitor.json', self.monitor), ('status/backup.json', self.backup)]:
            self.write(self.root / path, value)

    def test_healthy_source_bound_projection_contains_only_fixed_booleans(self):
        value = health.projection(self.root, NOW, self.units)
        self.assertEqual(set(value), set(health.CHECKS))
        self.assertTrue(all(v is True for v in value.values()))
        self.assertNotIn('private-only-value', json.dumps(value))
        self.assertNotIn('not-projected', json.dumps(value))

    def test_stale_or_future_or_failed_monitor_is_not_healthy(self):
        for stamp, ok in [(NOW - dt.timedelta(minutes=31), True), (NOW + dt.timedelta(seconds=1), True), (NOW, False)]:
            self.monitor.update(capturedAt=stamp.isoformat(), ok=ok)
            self.persist()
            value = health.projection(self.root, NOW, self.units)
            self.assertEqual(value['monitorRecordCurrent'], stamp == NOW)
            self.assertFalse(value['workerRuntimeHealthy'])

    def test_backup_freshness_and_worker_database_failures_are_independent(self):
        for field, value, check in [('pendingJobs', 1, 'workerRuntimeHealthy'), ('databaseTlsVerified', False, 'databaseTlsHealthy'),
                                    ('lastBackupAt', (NOW - dt.timedelta(hours=27)).isoformat(), 'backupFresh'),
                                    ('diskFreeBytes', 0, 'diskSpaceHealthy'), ('edgeClosed', False, 'accessBoundaryClosed')]:
            original = self.monitor['health'][field]
            self.monitor['health'][field] = value
            self.monitor['ok'] = False  # Real monitor writes failures this way.
            self.persist()
            self.assertFalse(health.projection(self.root, NOW, self.units)[check])
            self.assertTrue(health.projection(self.root, NOW, self.units)['monitorRecordCurrent'])
            self.monitor['health'][field] = original
            self.monitor['ok'] = True

    def test_changed_installed_source_or_status_binding_is_rejected(self):
        name = next(iter(health.SCRIPTS))
        self.write(self.root / 'scripts' / name, b'changed')
        self.assertFalse(health.projection(self.root, NOW, self.units)['sourceBindingCurrent'])
        self.monitor['sourceCommit'] = 'b' * 40
        self.persist()
        self.assertFalse(health.projection(self.root, NOW, self.units)['monitorRecordCurrent'])

    def test_symlink_and_hardlink_and_oversize_are_refused(self):
        path = self.root / 'status/monitor.json'
        for kind in ('symlink', 'hardlink', 'oversize'):
            with tempfile.TemporaryDirectory() as name:
                target = Path(name) / 'entry'
                if kind == 'symlink':
                    target.symlink_to(path)
                elif kind == 'hardlink':
                    os.link(path, target)
                else:
                    self.write(target, b'x' * (1024**2 + 1))
                with self.assertRaises(ValueError):
                    health.read(target)

    def test_arbitrary_ssh_command_cannot_read_status(self):
        output = io.StringIO()
        with patch.dict(os.environ, {'SSH_ORIGINAL_COMMAND': 'cat /root/.ssh/authorized_keys'}), \
                patch.object(health, 'projection') as reader, contextlib.redirect_stdout(output):
            self.assertEqual(health.main(), 1)
        reader.assert_not_called()
        value = json.loads(output.getvalue())
        self.assertFalse(value['ok'])
        self.assertTrue(all(v is False for v in value['checks'].values()))
        self.assertNotIn('/root/', output.getvalue())

    def test_old_or_failed_backup_status_is_rejected_even_if_monitor_fresh(self):
        for stamp, ok in [(NOW - dt.timedelta(hours=27), True), (NOW, False)]:
            self.backup.update(capturedAt=stamp.isoformat(), ok=ok)
            self.persist()
            value = health.projection(self.root, NOW, self.units)
            self.assertFalse(value['backupRecordCurrent'])
            self.assertFalse(value['backupFresh'])
