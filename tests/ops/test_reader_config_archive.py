import importlib.util
import os
from pathlib import Path
import shutil
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
        self.state.mkdir(exist_ok=True, mode=0o700)
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

    # --- expired-preparation archives (READER_PREPARATION_ARCHIVE_POLICY_VERSION) ---
    def archive_file(self, relative):
        archive = self.owner / 'personal-beta-readers-archive'
        path = archive / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        directory = path.parent
        while True:
            directory.chmod(0o700)
            if directory == archive:
                break
            directory = directory.parent
        path.write_bytes(b'synthetic archived configuration\n')
        path.chmod(0o600)
        return path

    ID = 'expired-20261012T203134Z-0123456789abcdef'

    def test_complete_and_interrupted_archives_are_both_captured_exactly(self):
        names = ['intent.json', 'complete.json', 'state/server.env', 'state/prepared.json',
                 'state/original/stage.json', 'state/original/server.env']
        paths = [self.archive_file(f'{self.ID}/{name}') for name in names]
        self.assertEqual(daily.reader_archive_config_paths(), sorted(paths))
        self.assertEqual(daily.reader_config_paths(), sorted(paths))  # active state absent
        partial = self.archive_file('expired-20261012T203135Z-fedcba9876543210/intent.json')
        self.assertIn(partial, daily.reader_config_paths())

    def test_active_and_archived_reader_files_are_captured_together(self):
        active = self.state / 'server.env'
        self.file(active)
        archived = self.archive_file(f'{self.ID}/intent.json')
        self.assertEqual(daily.reader_config_paths(), sorted([active, archived]))

    def test_absent_archive_root_changes_nothing(self):
        self.assertEqual(daily.reader_archive_config_paths(), [])

    def test_unknown_names_bad_ids_and_too_many_archives_fail_closed(self):
        root = self.owner / 'personal-beta-readers-archive'
        for relative in [f'{self.ID}/unexpected.json', f'{self.ID}/state/unexpected.json',
                         f'{self.ID}/state/original/unexpected.json', f'{self.ID}/state/journal.json',
                         'not-an-archive-id/intent.json', 'expired-20261012T203134Z-0123456789ABCDEF/intent.json']:
            with self.subTest(relative=relative):
                self.archive_file(relative)
                with self.assertRaises(ValueError):
                    daily.reader_archive_config_paths()
                shutil.rmtree(root)
        for index in range(9):
            self.archive_file(f'expired-20261012T2031{index:02d}Z-0123456789abcdef/intent.json')
        with self.assertRaisesRegex(ValueError, 'Too many'):
            daily.reader_archive_config_paths()

    def test_archive_aliases_hardlinks_public_modes_and_loose_directories_are_rejected(self):
        path = self.archive_file(f'{self.ID}/state/server.env')
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            daily.reader_archive_config_paths()
        path.chmod(0o600)
        alias = self.owner / 'archive-alias'
        os.link(path, alias)
        with self.assertRaises(ValueError):
            daily.reader_archive_config_paths()
        alias.unlink()
        path.unlink()
        path.symlink_to(self.owner / 'missing')
        with self.assertRaises(ValueError):
            daily.reader_archive_config_paths()
        path.unlink()
        (self.owner / 'personal-beta-readers-archive' / self.ID / 'state').chmod(0o755)
        with self.assertRaises(ValueError):
            daily.reader_archive_config_paths()

    def test_the_funded_operators_pinned_versions_are_unchanged(self):
        self.assertEqual((daily.READER_ARCHIVE_POLICY_VERSION, daily.PERSONAL_ARCHIVE_POLICY_VERSION), (1, 1))
        self.assertEqual(daily.READER_PREPARATION_ARCHIVE_POLICY_VERSION, 1)

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
