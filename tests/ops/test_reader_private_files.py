"""Actual POSIX file contracts; no production services or credentials."""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for name, file in [('alterward_backup', 'contabo-backup.py'), ('alterward_target', 'contabo-target.py'),
                   ('alterward_owner', 'contabo-owner.py'), ('alterward_activation', 'contabo-owner-activation.py'),
                   ('alterward_upgrade', 'contabo-owner-upgrade.py'), ('alterward_fence', 'contabo-writer-fence.py')]:
    load(name, file)
readers = load('reader_private_files', 'contabo-personal-beta-readers.py')


@unittest.skipIf(sys.platform == 'win32' or getattr(os, 'geteuid', lambda: -1)() != 0,
                 'Actual root POSIX fsync/mode/lock contract')
class ReaderPrivateFileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.owner = Path(self.temp.name)
        self.state = self.owner / 'personal-beta-readers'
        self.owner.chmod(0o700)
        self.state_patch = patch.object(readers, 'STATE', self.state)
        self.state_patch.start()
        self.root_patch = patch.dict(readers.private_directory.__globals__, ROOT=self.owner)
        self.root_patch.start()

    def tearDown(self):
        self.root_patch.stop()
        self.state_patch.stop()
        self.temp.cleanup()

    def test_create_and_replace_journal_are_private_durable_and_link_refusing(self):
        readers.private_directory(self.state)
        path = self.state / 'journal.json'
        readers.update_durable(path, b'first\n')
        self.assertEqual(path.stat().st_mode & 0o777, 0o600)
        readers.update_durable(path, b'second\n')
        self.assertEqual(path.read_bytes(), b'second\n')
        self.assertEqual(list(self.state.iterdir()), [path])
        readers.durable_file(path, b'second\n')
        with self.assertRaises(ValueError):
            readers.durable_file(path, b'different\n')
        path.unlink()
        path.symlink_to(self.owner / 'missing')
        with self.assertRaises(ValueError):
            readers.update_durable(path, b'never\n')

    def test_public_parent_cannot_receive_new_private_authority(self):
        self.state.mkdir(mode=0o755)
        with self.assertRaises(ValueError):
            readers.durable_file(self.state / 'journal.json', b'never\n')
        self.assertEqual(list(self.state.iterdir()), [])

    def test_real_prepare_with_umask_022_creates_private_parent_and_all_files(self):
        now = dt.datetime(2026, 10, 11, 16, 0, tzinfo=dt.timezone.utc)
        access = {'teamDomain': 'fixture.invalid', 'audience': 'a' * 64,
                  'allowedEmails': ['owner@example.invalid'], 'checkedAt': now.isoformat()}
        reviewed = {**access, 'allowedEmails': ['owner@example.invalid', 'reader@example.invalid']}
        candidate = {'services': {}}
        data = {'server.env': b"CLOSED_SITE_ALLOWED_EMAILS='owner@example.invalid'\n",
                'pinned-image.json': b'{}\n', 'effective-compose.json': b'{}\n', 'manifest.json': b'{}\n'}
        request = {'ownerAccess': access, 'readerAccess': reviewed, 'readers': ['reader@example.invalid'],
                   'ownerFlags': 'synthetic', 'sourceCommit': 'a' * 40, 'zeroStageProof': {},
                   'previousStageProof': {},
                   'buildProof': {'sourceDirectory': str(self.owner)}}
        daily = types.SimpleNamespace(utcnow=lambda: now, stable_state=lambda: {})
        policy = types.SimpleNamespace(reader_candidate=lambda *args, **kwargs: (candidate, reviewed),
                                       validate_reader_candidate=lambda *args, **kwargs: None)
        old_umask = os.umask(0o022)
        try:
            with patch.object(readers, 'current_digest'), \
                 patch.object(readers.upgrade, 'baseline', return_value=(data, {}, {})), \
                 patch.object(readers, 'owner_overlay', return_value={}), \
                 patch.object(readers, 'render', return_value=candidate), \
                 patch.object(readers, 'run', return_value=types.SimpleNamespace(stdout=json.dumps(candidate))), \
                 patch.object(readers.upgrade, 'proxy_network', return_value={}):
                result = readers.prepare(request, daily, policy)
        finally:
            os.umask(old_umask)
        self.assertTrue(result['prepared'])
        for path in [self.state, self.state / 'original']:
            self.assertEqual(path.stat().st_mode & 0o777, 0o700)
        files = [p for p in self.state.rglob('*') if p.is_file()]
        self.assertEqual(len(files), 13)  # journal is created only by apply
        for path in files:
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_contended_lock_waits_boundedly_and_never_bypasses_holder(self):
        import fcntl
        with patch.object(fcntl, 'flock', side_effect=[BlockingIOError(), None]) as lock, \
             patch.object(readers.time, 'sleep'):
            readers.exclusive_lock(7, 30)
        self.assertEqual(lock.call_count, 2)
        with patch.object(fcntl, 'flock', side_effect=BlockingIOError()), \
             patch.object(readers.time, 'monotonic', side_effect=[0, 30]), \
             patch.object(readers.time, 'sleep') as sleep:
            with self.assertRaises(ValueError):
                readers.exclusive_lock(7, 30)
        sleep.assert_not_called()


if __name__ == '__main__':
    unittest.main()
