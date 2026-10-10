"""Actual server/local helpers against disposable ciphertext fixtures only."""
import datetime as dt
import base64
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

    @unittest.skipIf(os.name == 'nt', 'Linux server metadata compaction')
    def test_joint_compaction_releases_active_slots_and_retains_resurrection_guard(self):
        due, manifest = server_fixture.fixture(self.server, NOW - dt.timedelta(days=8))
        expected = {due.name: manifest}
        local.attest(self.local, PROJECT, NOW, expected)
        local.expire(self.local, PROJECT, NOW, True)
        server.expire(self.server, expected, PROJECT, NOW, True)
        server.prune(self.server, expected, expected, PROJECT, NOW)
        local.prune(self.local, PROJECT, NOW, expected)
        a = server.catalog(self.server, PROJECT, NOW)
        b = local.metadata(self.local, PROJECT, NOW)
        self.assertEqual(a['expectedManifests'], {})
        self.assertEqual(b['expectedManifests'], {})
        self.assertEqual(a['archivedManifests'], b['archivedManifests'])
        self.assertEqual(a['archivedManifests'], expected)
        server_fixture.fixture(self.server, NOW - dt.timedelta(days=8))
        with self.assertRaises(ValueError):
            server.catalog(self.server, PROJECT, NOW)
        self.assertTrue((due / 'managed.dump.age').exists())
        # Local resurrection is refused even when the archived intent had no
        # local ciphertext at all (the server-only expired metadata path).
        data = {name: base64.b64encode((due / name).read_bytes()).decode() for name in server.FILES - {'manifest.json'}}
        with self.assertRaises(ValueError):
            local.store(self.local, PROJECT, NOW, manifest, data)

    @unittest.skipIf(os.name == 'nt', 'Linux compaction interruption')
    def test_interruption_after_metadata_unlink_recovers_each_side_independently(self):
        captured = NOW - dt.timedelta(days=8)
        due, manifest = server_fixture.fixture(self.server, captured)
        expected = {due.name: manifest}
        files = {name: base64.b64encode((due / name).read_bytes()).decode() for name in server.FILES - {'manifest.json'}}
        local.store(self.local, PROJECT, captured, manifest, files)
        local.expire(self.local, PROJECT, NOW, True)
        server.expire(self.server, expected, PROJECT, NOW, True)
        actual = os.unlink

        def stop(path, *args, **kwargs):
            result = actual(path, *args, **kwargs)
            raise InterruptedError('Synthetic metadata interruption')

        with patch.object(os, 'unlink', side_effect=stop), self.assertRaises(InterruptedError):
            server.prune(self.server, expected, expected, PROJECT, NOW)
        self.assertEqual(server.catalog(self.server, PROJECT, NOW)['archivedManifests'], expected)
        server.prune(self.server, expected, expected, PROJECT, NOW)
        with patch.object(os, 'unlink', side_effect=stop), self.assertRaises(InterruptedError):
            local.prune(self.local, PROJECT, NOW, expected)
        self.assertEqual(local.metadata(self.local, PROJECT, NOW)['archivedManifests'], expected)
        local.prune(self.local, PROJECT, NOW, expected)
        self.assertEqual(local.metadata(self.local, PROJECT, NOW)['expectedManifests'], {})
        self.assertEqual(server.catalog(self.server, PROJECT, NOW)['expectedManifests'], {})

    @unittest.skipIf(os.name == 'nt', 'Linux repeated server compaction')
    def test_more_than_one_hundred_completed_captures_do_not_fill_active_limit(self):
        for index in range(101):
            due, manifest = server_fixture.fixture(self.server, NOW - dt.timedelta(days=8), suffix=f'{index:08x}')
            expected = {due.name: manifest}
            local.attest(self.local, PROJECT, NOW, expected)
            server.expire(self.server, expected, PROJECT, NOW, True)
            server.prune(self.server, expected, expected, PROJECT, NOW)
            local.prune(self.local, PROJECT, NOW, expected)
        server_metadata = server.catalog(self.server, PROJECT, NOW)
        local_metadata = local.metadata(self.local, PROJECT, NOW)
        self.assertEqual(server_metadata['expectedManifests'], {})
        self.assertEqual(local_metadata['expectedManifests'], {})
        self.assertEqual(len(server_metadata['archivedManifests']), 101)
        self.assertEqual(server_metadata['archivedManifests'], local_metadata['archivedManifests'])
        fresh, manifest = server_fixture.fixture(self.server, NOW)
        bundle = server.read_bundle(self.server, {fresh.name: manifest}, PROJECT, NOW, fresh.name)
        local.store(self.local, PROJECT, NOW, manifest, bundle['files'])
        self.assertEqual(local.read_bundle(self.local, PROJECT, NOW)['manifest'], manifest)

    def test_pruning_fresh_or_still_present_copies_is_refused(self):
        fresh, manifest = server_fixture.fixture(self.server, NOW)
        expected = {fresh.name: manifest}
        bundle = server.read_bundle(self.server, expected, PROJECT, NOW, fresh.name)
        local.store(self.local, PROJECT, NOW, manifest, bundle['files'])
        with self.assertRaises(ValueError):
            server.prune(self.server, expected, expected, PROJECT, NOW)
        with self.assertRaises(ValueError):
            local.prune(self.local, PROJECT, NOW, expected)
        self.assertTrue((fresh / 'managed.dump.age').exists())
        self.assertEqual(local.read_bundle(self.local, PROJECT, NOW)['manifest'], manifest)

    def test_metadata_only_tombstone_sizes_never_consume_ciphertext_byte_limit(self):
        manifests = {}
        for index in range(3):
            manifest, _ = local_fixture.fixture(self.local, NOW - dt.timedelta(days=8), suffix=f'{index:08x}', write=False)
            for item in manifest['encryptedFiles'].values():
                item['bytes'] = 128 * 1024**2
            manifests[manifest['runId']] = manifest
        local.attest(self.local, PROJECT, NOW, manifests)
        proof = local.expire(self.local, PROJECT, NOW)
        self.assertEqual(proof['knownArchives'], 3)
        self.assertEqual(proof['removedFiles'], 0)
        self.assertEqual(len(local.metadata(self.local, PROJECT, NOW)['serverAttestedOnlyRuns']), 3)
        if os.name != 'nt':
            # Synthetic completed intent metadata: no large files are created.
            import hashlib
            import json
            import stat
            for index, (run, manifest) in enumerate(manifests.items()):
                values = {}
                for name, item in {**manifest['encryptedFiles'], 'manifest.json': {
                        'bytes': len(json.dumps(manifest).encode()),
                        'sha256': hashlib.sha256(json.dumps(manifest).encode()).hexdigest()}}.items():
                    values[name] = {**item, 'identity': [1, index + 1, stat.S_IFREG | 0o600, server.UID, 1, item['bytes'], 1, 1]}
                record = {'schemaVersion': 'alterward-server-expiry-1', 'manifest': manifest,
                          'rootIdentity': [self.server.stat().st_dev, self.server.stat().st_ino],
                          'directoryIdentity': [1, index + 1, stat.S_IFDIR | 0o700, server.UID, 2, 0, 1, 1], 'files': values}
                server.write_journal(self.server, record)
            self.assertEqual(server.expire(self.server, manifests, PROJECT, NOW)['completedTombstones'], 3)


if __name__ == '__main__':
    unittest.main()
