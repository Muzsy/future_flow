"""The full config collector must back up real immutable SPR generations.

Use the existing discarded legacy/funded fixture for unrelated input paths, but
exercise the real service catalog, real file readers and real profile writer.
No Docker, credentials, database or production paths are used.
"""
import io
import os
from pathlib import Path
import stat
import tarfile
import unittest
from unittest.mock import patch

import test_funded_backup_anchor as anchor
import test_service_daily_evidence as service


daily = anchor.daily


@unittest.skipIf(os.name != 'posix', 'POSIX file-mode contracts')
class ServiceProfileConfigArchiveTests(unittest.TestCase):
    def setUp(self):
        real_regular, real_catalog = daily.regular, daily.service_config_paths
        fixture = anchor.FundedBackupAnchorTests('test_real_collector_preserves_current_legacy_and_funded_bytes')
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        fixture.archive_fixture()
        self.root, self.owner = fixture.root, fixture.owner
        # The older anchor fixture intentionally tests byte continuity only.
        # Here every file has real private permissions; neither reader is mocked.
        for path in self.root.rglob('*'):
            if path.is_file():
                path.chmod(0o600)
        self.record = self.root / 'service-profile'
        for patcher in [patch.object(daily, 'regular', real_regular),
                        patch.object(daily, 'service_config_paths', real_catalog),
                        patch.object(daily, 'UID', os.geteuid()),
                        patch.object(daily, 'SERVICE_PROFILE_DIR', self.record),
                        patch.object(daily, 'SERVICE_OPERATION_DIR', self.root / 'service-operations'),
                        patch.object(daily, 'SERVICE_ENV_DIR', self.root / 'service-env')]:
            patcher.start()
            self.addCleanup(patcher.stop)
        service.spr.activate(self.record, service.profile(), now=service.NOW)
        self.profile = self.record / 'profiles/1.json'

    def capture(self):
        return daily.extended_config_archive({})

    def test_real_0400_generation_bytes_are_in_the_full_archive_without_chmod(self):
        before = self.profile.read_bytes()
        self.assertEqual(stat.S_IMODE(self.profile.lstat().st_mode), 0o400)
        data, hashes = self.capture()
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            members = archive.getmembers()
            self.assertTrue(all(m.mode == 0o600 for m in members))
            actual = {m.name: archive.extractfile(m).read() for m in members}
        self.assertEqual(hashes, {name: daily.digest(data) for name, data in actual.items()})
        for path in [self.profile, self.record / 'head.json', self.record / 'journal.jsonl',
                     self.owner / 'server.env']:
            key = str(path).lstrip('/')
            self.assertEqual(actual[key], path.read_bytes())
            self.assertEqual(hashes[key], daily.digest(actual[key]))
        self.assertEqual(actual[str(self.profile).lstrip('/')], before)
        self.assertEqual(stat.S_IMODE(self.profile.lstat().st_mode), 0o400)

    def test_existing_private_0600_generation_remains_accepted(self):
        self.profile.chmod(0o600)
        self.capture()
        self.assertEqual(stat.S_IMODE(self.profile.lstat().st_mode), 0o600)

    def test_generic_reader_still_refuses_0400_even_for_a_profile(self):
        with self.assertRaisesRegex(ValueError, 'Private regular file required'):
            daily.regular(self.profile)

    def test_legacy_owner_file_does_not_gain_a_0400_exception(self):
        (self.owner / 'server.env').chmod(0o400)
        with self.assertRaisesRegex(ValueError, 'Private regular file required'):
            self.capture()

    def test_non_generation_service_head_still_requires_0600(self):
        (self.record / 'head.json').chmod(0o400)
        with self.assertRaisesRegex(ValueError, 'Private regular file required'):
            self.capture()

    def test_public_or_group_readable_generation_is_rejected(self):
        for mode in [0o444, 0o644, 0o440, 0o404, 0o666]:
            with self.subTest(mode=oct(mode)):
                self.profile.chmod(mode)
                with self.assertRaises(ValueError):
                    self.capture()

    def test_unknown_generation_name_is_not_added_to_the_archive(self):
        path = self.profile.with_name('notes.json')
        path.write_bytes(b'unknown')
        path.chmod(0o400)
        with self.assertRaisesRegex(ValueError, 'Unknown service profile evidence'):
            self.capture()

    def test_symlink_generation_is_rejected(self):
        original = self.root / 'original-profile.json'
        self.profile.rename(original)
        self.profile.symlink_to(original)
        with self.assertRaises(ValueError):
            self.capture()

    def test_hardlinked_generation_is_rejected(self):
        os.link(self.profile, self.root / 'linked-profile.json')
        with self.assertRaises(ValueError):
            self.capture()

    def test_foreign_owned_generation_is_rejected(self):
        original = Path.lstat
        def different_owner(path, *args, **kwargs):
            result = original(path, *args, **kwargs)
            if path == self.profile:
                fields = list(result)
                fields[4] = os.geteuid() + 1
                return os.stat_result(fields)
            return result
        with patch.object(Path, 'lstat', different_owner):
            with self.assertRaises(ValueError):
                self.capture()


if __name__ == '__main__':
    unittest.main()
