import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


load('alterward_backup', 'contabo-backup.py')
daily = load('funded_archive_daily', 'contabo-daily.py')


@unittest.skipIf(sys.platform == 'win32', 'POSIX private file/directory contracts')
class FundedUpgradeArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.owner = Path(self.temp.name).resolve()
        self.root = self.owner / 'funded-upgrade'
        self.attempt = self.root / ('a' * 12 + '-20261019T120000Z')
        self.patches = [patch.object(daily, 'OWNER', self.owner), patch.object(daily, 'UID', os.getuid())]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def file(self, path):
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        path.write_bytes(b'synthetic funded upgrade evidence; no real provider')
        path.chmod(0o600)
        return path

    def test_absent_root_is_empty_and_policy_version_is_pinned(self):
        self.assertEqual(daily.funded_upgrade_config_paths(), [])
        self.assertEqual(daily.FUNDED_UPGRADE_ARCHIVE_POLICY_VERSION, 1)

    def test_every_attempt_journal_previous_and_recovery_file_is_archived(self):
        paths = [self.file(self.attempt / name) for name in ('prepared.json', 'journal.json', 'server.env')]
        paths.append(self.file(self.attempt / 'previous' / 'manifest.json'))
        paths.append(self.file(self.attempt / 'recovery' / 'effective-compose.json'))
        paths.append(self.file(self.attempt / '.upgrade-abcd_123'))
        for directory in (self.root, self.attempt, self.attempt / 'previous', self.attempt / 'recovery'):
            directory.chmod(0o700)
        self.assertEqual(daily.funded_upgrade_config_paths(), sorted(paths))

    def test_unexpected_names_modes_and_links_are_refused(self):
        self.file(self.attempt / 'prepared.json')
        self.root.chmod(0o700)
        self.attempt.chmod(0o700)
        cases = []
        cases.append(lambda: self.file(self.attempt / 'notes.txt'))
        cases.append(lambda: self.file(self.root / 'not-an-attempt' / 'prepared.json'))
        cases.append(lambda: (self.attempt / 'journal.json').symlink_to(self.attempt / 'prepared.json'))
        cases.append(lambda: self.attempt.chmod(0o755))
        cases.append(lambda: (self.attempt / 'prepared.json').chmod(0o644))
        for make in cases:
            with self.subTest(make=make):
                self.tearDown()
                self.setUp()
                self.file(self.attempt / 'prepared.json')
                self.root.chmod(0o700)
                self.attempt.chmod(0o700)
                make()
                with self.assertRaises(ValueError):
                    daily.funded_upgrade_config_paths()


if __name__ == '__main__':
    unittest.main()
