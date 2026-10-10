"""Actual server/local helpers against disposable ciphertext fixtures only."""
import datetime as dt
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import test_local_managed_recovery as local_fixture
import test_managed_expiry as server_fixture

local = local_fixture.local
server = local_fixture.server
NOW = local_fixture.NOW
PROJECT = local_fixture.PROJECT


class ManagedReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.server = self.root / 'server'
        self.local = self.root / 'local'
        self.server.mkdir(mode=0o700)
        self.local.mkdir(mode=0o700)
        self.patches = [patch.object(server, 'UID', getattr(os, 'getuid', lambda: 0)())]
        if os.name == 'nt':
            self.patches += [patch.object(server, 'directory', side_effect=server_fixture.windows_directory),
                             patch.object(server, 'original_file', side_effect=server_fixture.windows_file)]
        for value in self.patches:
            value.start()

    def tearDown(self):
        for value in reversed(self.patches):
            value.stop()
        self.temporary.cleanup()

    def test_server_only_fresh_archive_download_is_identical_and_retryable(self):
        path, manifest = server_fixture.fixture(self.server, NOW)
        catalog = server.catalog(self.server, PROJECT, NOW)
        bundle = server.read_bundle(self.server, catalog['expectedManifests'], PROJECT, NOW, path.name)
        local.store(self.local, PROJECT, NOW, bundle['manifest'], bundle['files'])
        local.store(self.local, PROJECT, NOW, bundle['manifest'], bundle['files'])
        local.attest(self.local, PROJECT, NOW, catalog['expectedManifests'])
        self.assertEqual(local.metadata(self.local, PROJECT, NOW)['expectedManifests'], catalog['expectedManifests'])
        reread = local.read_bundle(self.local, PROJECT, NOW)
        self.assertEqual(reread, bundle)
        self.assertEqual(local.expire(self.local, PROJECT, NOW, True)['removedFiles'], 0)
        self.assertFalse((self.server / server.JOURNAL).exists())

    @unittest.skipIf(os.name == 'nt', 'Linux actual server expiry')
    def test_expire_local_then_server_preserves_equal_manifests_after_both_unlinks(self):
        due, a = server_fixture.fixture(self.server, NOW - dt.timedelta(days=8))
        fresh, b = server_fixture.fixture(self.server, NOW)
        expected = {due.name: a, fresh.name: b}
        bundle = server.read_bundle(self.server, expected, PROJECT, NOW, fresh.name)
        local.store(self.local, PROJECT, NOW, b, bundle['files'])
        local.attest(self.local, PROJECT, NOW, expected)
        local.expire(self.local, PROJECT, NOW, True)
        server.expire(self.server, local.metadata(self.local, PROJECT, NOW)['expectedManifests'], PROJECT, NOW, True)
        self.assertFalse(due.exists())
        self.assertTrue(fresh.exists())
        self.assertEqual(local.metadata(self.local, PROJECT, NOW)['expectedManifests'], server.catalog(self.server, PROJECT, NOW)['expectedManifests'])
        self.assertEqual(local.read_bundle(self.local, PROJECT, NOW)['manifest'], b)
        self.assertEqual(server.expire(self.server, expected, PROJECT, NOW, True)['removedArchives'], 0)

    @unittest.skipIf(os.name == 'nt', 'Linux resumed server expiry')
    def test_interrupted_server_deletion_after_local_expiry_resumes_from_metadata(self):
        due, manifest = server_fixture.fixture(self.server, NOW - dt.timedelta(days=8))
        expected = {due.name: manifest}
        local.attest(self.local, PROJECT, NOW, expected)
        local.expire(self.local, PROJECT, NOW, True)
        actual = os.unlink

        def stop(path, *args, **kwargs):
            actual(path, *args, **kwargs)
            if path == 'catalog.json.age' and 'dir_fd' in kwargs:
                raise InterruptedError('Synthetic interrupted server expiry')

        with patch.object(os, 'unlink', side_effect=stop), self.assertRaises(InterruptedError):
            server.expire(self.server, expected, PROJECT, NOW, True)
        catalog = server.catalog(self.server, PROJECT, NOW)
        self.assertEqual(catalog['pendingRuns'], [due.name])
        metadata = local.metadata(self.local, PROJECT, NOW)
        server.expire(self.server, metadata['expectedManifests'], PROJECT, NOW, True)
        self.assertEqual(server.catalog(self.server, PROJECT, NOW)['completedRuns'], [due.name])
        self.assertFalse(due.exists())


if __name__ == '__main__':
    unittest.main()
