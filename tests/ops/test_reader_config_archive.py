import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


load('alterward_backup', 'contabo-backup.py')
daily = load('reader_archive_daily', 'contabo-daily.py')


@unittest.skipIf(sys.platform == 'win32', 'Root POSIX directory/mode contract')
class ReaderConfigArchiveTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.owner = Path(self.temp.name)
        self.state = self.owner / 'personal-beta-readers'
        self.owner_patch = patch.object(daily, 'OWNER', self.owner)
        self.uid_patch = patch.object(daily, 'UID', os.getuid())
        self.owner_patch.start()
        self.uid_patch.start()

    def tearDown(self):
        self.uid_patch.stop()
        self.owner_patch.stop()
        self.temp.cleanup()

    def file(self, path):
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.write_bytes(b'synthetic private configuration\n')
        path.chmod(0o600)

    def test_absent_reader_state_keeps_existing_archive_unchanged(self):
        self.assertEqual(daily.reader_config_paths(), [])

    def test_partial_preparation_and_disabled_journal_are_both_preserved(self):
        paths = [self.state / 'original' / 'server.env', self.state / 'manifest.json', self.state / 'journal.json']
        for path in paths:
            self.file(path)
        self.assertEqual(daily.reader_config_paths(), sorted(paths))

    def test_unknown_artifact_or_nested_directory_is_rejected(self):
        self.file(self.state / 'unexpected.json')
        with self.assertRaises(ValueError):
            daily.reader_config_paths()
        (self.state / 'unexpected.json').unlink()
        (self.state / 'nested').mkdir(mode=0o700)
        with self.assertRaises(ValueError):
            daily.reader_config_paths()

    def test_interrupted_journal_temporary_files_are_bounded_and_private(self):
        path = self.state / '.upgrade-abc123_4'
        self.file(path)
        self.assertEqual(daily.reader_config_paths(), [path])
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            daily.reader_config_paths()
        path.chmod(0o600)
        for index in range(8):
            self.file(self.state / f'.upgrade-{index:08d}')
        with self.assertRaises(ValueError):
            daily.reader_config_paths()

    def test_aliases_hardlinks_and_public_permissions_are_rejected(self):
        path = self.state / 'server.env'
        self.file(path)
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            daily.reader_config_paths()
        path.chmod(0o600)
        alias = self.owner / 'alias'
        os.link(path, alias)
        with self.assertRaises(ValueError):
            daily.reader_config_paths()
        alias.unlink()
        path.unlink()
        path.symlink_to(self.owner / 'missing')
        with self.assertRaises(ValueError):
            daily.reader_config_paths()


if __name__ == '__main__':
    unittest.main()
