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
daily = load('personal_archive_daily', 'contabo-daily.py')


@unittest.skipIf(sys.platform == 'win32', 'POSIX private file/directory contracts')
class PersonalArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.owner = Path(self.temp.name)
        self.state = self.owner / 'personal-beta'
        self.patches = [patch.object(daily, 'OWNER', self.owner), patch.object(daily, 'UID', os.getuid())]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def file(self, name):
        self.state.mkdir(mode=0o700, exist_ok=True)
        path = self.state / name
        path.write_bytes(b'synthetic private evidence; no real provider')
        path.chmod(0o600)
        return path

    def test_absent_state_keeps_owner_archive_unchanged(self):
        self.assertEqual(daily.personal_config_paths(), [])

    def test_partial_preparation_both_journals_and_observation_are_preserved(self):
        names = ['server.env', 'pinned-image.json', 'effective-compose.json', 'manifest.json',
                 'terms.json', 'prepared.json', 'transition.json', 'journal.json', 'observation.json']
        paths = [self.file(name) for name in names]
        self.assertEqual(daily.personal_config_paths(), sorted(paths))

    def test_unlisted_nested_alias_and_public_artifacts_refuse_capture(self):
        path = self.file('server.env')
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            daily.personal_config_paths()
        path.chmod(0o600)
        alias = self.owner / 'hardlink'
        os.link(path, alias)
        with self.assertRaises(ValueError):
            daily.personal_config_paths()
        alias.unlink()
        path.unlink()
        path.symlink_to(self.owner / 'missing')
        with self.assertRaises(ValueError):
            daily.personal_config_paths()
        path.unlink()
        self.file('unexpected.json')
        with self.assertRaises(ValueError):
            daily.personal_config_paths()

    def test_interrupted_temporary_evidence_is_limited_to_eight_private_files(self):
        for index in range(8):
            self.file(f'.upgrade-{index:08d}')
        self.assertEqual(len(daily.personal_config_paths()), 8)
        self.file('.upgrade-1234abcd')
        with self.assertRaises(ValueError):
            daily.personal_config_paths()

    def test_directory_permissions_and_aliases_are_checked(self):
        self.file('prepared.json')
        self.state.chmod(0o755)
        with self.assertRaises(ValueError):
            daily.personal_config_paths()


if __name__ == '__main__':
    unittest.main()
