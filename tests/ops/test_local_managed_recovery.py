import base64
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import tempfile
import unittest
from unittest.mock import patch

OPS = Path(__file__).resolve().parents[2] / 'scripts' / 'ops'


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, OPS / file)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


server = load('alterward_managed_expiry', 'contabo-managed-expiry.py')
local = load('local_managed_recovery', 'local-managed-recovery.py')
NOW = dt.datetime(2026, 10, 10, 16, 0, tzinfo=dt.timezone.utc)
PROJECT = 'a' * 64


def fixture(root, captured, suffix='12345678', write=True):
    run = captured.strftime('%Y%m%dT%H%M%SZ-') + suffix
    files = {name: b'synthetic encrypted fixture without personal data ' + name.encode()
             for name in sorted(local.FILES - {'manifest.json'})}
    manifest = {'schemaVersion': 'alterward-managed-recovery-2', 'runId': run,
                'capturedAt': captured.isoformat(), 'expiresAt': (captured + dt.timedelta(days=7)).isoformat(),
                'projectBinding': PROJECT, 'sourceCommit': 'b' * 40, 'postgresImage': server.PG_IMAGE,
                'scope': 'auth-storage-data-and-public-security', 'publicDataIncluded': False,
                'liveDatabaseWrites': False, 'restoreOrActivationAllowed': False,
                'originalDailyRecipientMatched': True, 'ephemeralAuthDataExcludedAtCapture': True,
                'ephemeralStorageUploadDataExcludedAtCapture': True, 'authUserTokenColumnsClearedAtCapture': True,
                'encryptedFiles': {n: {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()} for n, b in files.items()}}
    if write:
        for name, data in {**files, 'manifest.json': local.encoded(manifest)}.items():
            local.exclusive_write(root / (run + '-' + name), data)
    return manifest, {n: base64.b64encode(b).decode() for n, b in files.items()}


class LocalManagedTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name).resolve()
        self.root.chmod(0o700)

    def tearDown(self):
        self.temporary.cleanup()

    def test_exact_seven_days_and_read_only_check(self):
        due, _ = fixture(self.root, NOW - dt.timedelta(days=7))
        fresh, _ = fixture(self.root, NOW - dt.timedelta(days=7) + dt.timedelta(seconds=1))
        before = sorted(p.name for p in self.root.iterdir())
        result = local.expire(self.root, PROJECT, NOW)
        self.assertEqual((result['expiredArchives'], result['removedFiles']), (1, 0))
        self.assertEqual(before, sorted(p.name for p in self.root.iterdir()))
        self.assertEqual(result['completeFreshArchives'], 1)

    def test_apply_removes_due_files_and_pointer_preserves_fresh_and_auxiliary(self):
        due, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        fresh, _ = fixture(self.root, NOW)
        local.exclusive_write(self.root / local.POINTER, local.encoded({'runId': due['runId']}))
        sentinel = self.root / 'inventory-proof.json'
        local.exclusive_write(sentinel, b'{"preserve":true}')
        result = local.expire(self.root, PROJECT, NOW, True)
        self.assertEqual(result['removedFiles'], 3)
        self.assertFalse((self.root / local.POINTER).exists())
        self.assertTrue(sentinel.exists())
        self.assertTrue((self.root / (fresh['runId'] + '-managed.dump.age')).exists())
        metadata = local.journal_records(self.root, PROJECT, NOW)
        self.assertEqual(metadata[due['runId']]['expiry']['manifest'], due)
        self.assertEqual(local.expire(self.root, PROJECT, NOW, True)['removedFiles'], 0)

    def test_last_copy_expires_without_extending_deadline(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=7))
        self.assertEqual(local.expire(self.root, PROJECT, NOW, True)['removedFiles'], 3)
        self.assertFalse(any(p.name.endswith('.age') for p in self.root.iterdir()))
        self.assertEqual(local.expire(self.root, PROJECT, NOW)['expiredArchives'], 1)

    def test_corrupt_fresh_missing_or_unknown_files_block_whole_batch(self):
        due, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        fresh, _ = fixture(self.root, NOW)
        path = self.root / (fresh['runId'] + '-catalog.json.age')
        original = path.read_bytes()
        for mutation in ('corrupt', 'missing', 'foreign'):
            if mutation == 'corrupt':
                path.write_bytes(b'corrupt')
            elif mutation == 'missing':
                path.unlink()
            else:
                local.exclusive_write(self.root / 'foreign.age', b'foreign')
            with self.assertRaises(ValueError):
                local.expire(self.root, PROJECT, NOW, True)
            self.assertTrue((self.root / (due['runId'] + '-managed.dump.age')).exists())
            self.assertFalse((self.root / local.JOURNAL).exists())
            if path.exists():
                path.write_bytes(original)
            else:
                local.exclusive_write(path, original)
            if (self.root / 'foreign.age').exists():
                (self.root / 'foreign.age').unlink()

    def test_interruption_after_every_unlink_resumes_exact_missing_files(self):
        for failure in range(1, 5):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as temp:
                root = Path(temp).resolve()
                root.chmod(0o700)
                manifest, _ = fixture(root, NOW - dt.timedelta(days=8))
                local.exclusive_write(root / local.POINTER, local.encoded({'runId': manifest['runId']}))
                original = os.unlink
                calls = 0

                def stop(path, *args, **kwargs):
                    nonlocal calls
                    result = original(path, *args, **kwargs)
                    calls += 1
                    if calls == failure:
                        raise RuntimeError('synthetic process interruption')
                    return result

                with patch.object(os, 'unlink', side_effect=stop), self.assertRaises(RuntimeError):
                    local.expire(root, PROJECT, NOW, True)
                result = local.expire(root, PROJECT, NOW, True)
                self.assertEqual(result['removedFiles'], max(0, 3 - failure))
                self.assertFalse((root / local.POINTER).exists())
                self.assertFalse(any(p.name.endswith('.age') for p in root.iterdir()))

    def test_interruption_before_first_unlink_keeps_valid_journal_and_recovers(self):
        fixture(self.root, NOW - dt.timedelta(days=8))
        with patch.object(os, 'unlink', side_effect=RuntimeError('interrupt')), self.assertRaises(RuntimeError):
            local.expire(self.root, PROJECT, NOW, True)
        self.assertEqual(local.expire(self.root, PROJECT, NOW, True)['removedFiles'], 3)

    def test_reinserted_cipher_with_same_bytes_but_new_identity_blocks_resume(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        path = self.root / (manifest['runId'] + '-catalog.json.age')
        original = path.read_bytes()
        unlink = os.unlink

        def stop(p):
            unlink(p)
            raise RuntimeError('interrupt')

        with patch.object(os, 'unlink', side_effect=stop), self.assertRaises(RuntimeError):
            local.expire(self.root, PROJECT, NOW, True)
        local.exclusive_write(path, original)
        with self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW, True)
        self.assertTrue(path.exists())

    def test_corrupt_or_truncated_journal_prevents_all_deletion(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        journal = local.journal_dir(self.root, True) / (manifest['runId'] + '.expiry.json')
        local.exclusive_write(journal, b'{')
        with self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW, True)
        self.assertTrue((self.root / (manifest['runId'] + '-managed.dump.age')).exists())

    def test_journal_cannot_authorize_wrong_root_fresh_or_foreign_file(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        with patch.object(os, 'unlink', side_effect=RuntimeError('interrupt')), self.assertRaises(RuntimeError):
            local.expire(self.root, PROJECT, NOW, True)
        journal = local.journal_dir(self.root) / (manifest['runId'] + '.expiry.json')
        record = json.loads(journal.read_bytes())
        for change in [{'rootIdentity': [0, 0]}, {'files': {'../foreign': {}}},
                       {'manifest': {**manifest, 'expiresAt': (NOW + dt.timedelta(days=1)).isoformat()}}]:
            journal.write_bytes(local.encoded({**record, **change}))
            with self.assertRaises(ValueError):
                local.expire(self.root, PROJECT, NOW, True)
        self.assertTrue((self.root / (manifest['runId'] + '-managed.dump.age')).exists())

    def test_hardlinks_and_symlinks_never_read_or_delete_foreign_data(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        path = self.root / (manifest['runId'] + '-catalog.json.age')
        alias = self.root / 'keep.txt'
        os.link(path, alias)
        with self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW, True)
        alias.unlink()
        path.unlink()
        alias.write_bytes(b'foreign')
        try:
            path.symlink_to(alias)
        except OSError:
            # Windows developer mode may not permit symlink creation. The
            # hardlink branch still ran; Linux CI exercises this real symlink.
            return
        with self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW, True)
        self.assertEqual(alias.read_bytes(), b'foreign')

    def test_changed_batch_after_recheck_stops_before_unlink(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8))
        original = local.exclusive_write

        def changed(path, data):
            original(path, data)
            if path.name.endswith('.expiry.json'):
                original(self.root / 'unexpected.age', b'foreign')

        with patch.object(local, 'exclusive_write', side_effect=changed), self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW, True)
        self.assertTrue((self.root / (manifest['runId'] + '-catalog.json.age')).exists())

    def test_store_is_verified_idempotent_and_read_uses_same_lock_boundary(self):
        manifest, files = fixture(self.root, NOW, write=False)
        with local.local_lock(self.root):
            local.store(self.root, PROJECT, NOW, manifest, files)
        first = local.read_bundle(self.root, PROJECT, NOW)
        local.store(self.root, PROJECT, NOW, manifest, files)
        self.assertEqual(first, {'manifest': manifest, 'files': files})
        with self.assertRaises(ValueError):
            local.store(self.root, PROJECT, NOW, manifest, {**files, 'managed.dump.age': 'Y29ycnVwdA=='})
        with self.assertRaises(ValueError):
            local.read_bundle(self.root, PROJECT, NOW + dt.timedelta(days=7))

    def test_interrupted_capture_after_complete_file_write_resumes_without_overwrite(self):
        manifest, files = fixture(self.root, NOW, write=False)
        original = local.exclusive_write
        fired = False

        def stop(path, data):
            nonlocal fired
            original(path, data)
            if path.name.endswith('-catalog.json.age') and not fired:
                fired = True
                raise RuntimeError('interrupt')

        with patch.object(local, 'exclusive_write', side_effect=stop), self.assertRaises(RuntimeError):
            local.store(self.root, PROJECT, NOW, manifest, files)
        local.store(self.root, PROJECT, NOW, manifest, files)
        self.assertEqual(local.read_bundle(self.root, PROJECT, NOW)['files'], files)

    def test_expired_partial_capture_is_cleaned_and_cannot_be_resurrected(self):
        manifest, files = fixture(self.root, NOW, write=False)
        journal = local.journal_dir(self.root, True) / (manifest['runId'] + '.capture.json')
        local.exclusive_write(journal, local.encoded({'schemaVersion': 'alterward-local-capture-1', 'manifest': manifest}))
        local.exclusive_write(self.root / (manifest['runId'] + '-catalog.json.age'), base64.b64decode(files['catalog.json.age']))
        self.assertEqual(local.expire(self.root, PROJECT, NOW + dt.timedelta(days=7), True)['removedFiles'], 1)
        with self.assertRaises(ValueError):
            local.store(self.root, PROJECT, NOW, manifest, files)

    def test_pointer_to_fresh_run_survives_and_invalid_pointer_blocks_batch(self):
        fixture(self.root, NOW - dt.timedelta(days=8))
        fresh, _ = fixture(self.root, NOW)
        pointer = self.root / local.POINTER
        local.exclusive_write(pointer, local.encoded({'runId': fresh['runId']}))
        local.expire(self.root, PROJECT, NOW, True)
        self.assertEqual(json.loads(pointer.read_bytes()), {'runId': fresh['runId']})
        pointer.write_bytes(local.encoded({'runId': '../foreign'}))
        with self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW, True)

    def test_real_cross_process_kernel_lock_contention_and_death_release(self):
        code = ('import sys; sys.path.insert(0,sys.argv[1]); '
                'exec(open(sys.argv[2],encoding="utf8").read().split("if __name__")[0]); '
                'r=Path(sys.argv[3]); c=local_lock(r); c.__enter__(); '
                'print("LOCKED",flush=True); sys.stdin.read()')
        # Import shim avoids sending project data or secrets to a child.
        with tempfile.TemporaryDirectory() as temp:
            shim = Path(temp)
            (shim / 'alterward_managed_expiry.py').write_text((OPS / 'contabo-managed-expiry.py').read_text(), encoding='utf8')
            child = subprocess.Popen([sys.executable, '-c', code, str(shim), str(OPS / 'local-managed-recovery.py'), str(self.root)],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                self.assertEqual(child.stdout.readline().strip(), 'LOCKED')
                with self.assertRaises(OSError):
                    with local.local_lock(self.root):
                        self.fail('Concurrent process cannot acquire lock')
            finally:
                child.kill()
                child.communicate(timeout=5)
            with local.local_lock(self.root):
                pass

    def test_real_process_exit_during_unlink_recovers_under_released_kernel_lock(self):
        with tempfile.TemporaryDirectory() as temp:
            shim = Path(temp)
            (shim / 'alterward_managed_expiry.py').write_text((OPS / 'contabo-managed-expiry.py').read_text(), encoding='utf8')
            code = ('import sys; sys.path.insert(0,sys.argv[1]); '
                    'exec(open(sys.argv[2],encoding="utf8").read().split("if __name__")[0]); '
                    'r=Path(sys.argv[3]); original=os.unlink; '
                    'exec("def stop(path):\\n original(path)\\n os._exit(73)"); '
                    'os.unlink=stop; '
                    'exec("with local_lock(r):\\n expire(r,sys.argv[4],dt.datetime.fromisoformat(sys.argv[5]),True)")')
            manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8))
            run = subprocess.run([sys.executable, '-c', code, str(shim), str(OPS / 'local-managed-recovery.py'),
                                  str(self.root), PROJECT, NOW.isoformat()], capture_output=True, timeout=10)
            self.assertEqual(run.returncode, 73, run.stderr.decode())
            with local.local_lock(self.root):
                self.assertEqual(local.expire(self.root, PROJECT, NOW, True)['removedFiles'], 2)
            self.assertEqual(local.journal_records(self.root, PROJECT, NOW)[manifest['runId']]['expiry']['manifest'], manifest)

    def test_main_uses_earlier_clock_and_fixed_workspace(self):
        actual_datetime = dt.datetime

        class Clock(actual_datetime):
            @classmethod
            def now(cls, tz=None):
                return NOW

        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp).resolve()
            parent = workspace / '.local'
            parent.mkdir(mode=0o700)
            root = parent / 'supabase-recovery'
            root.mkdir(mode=0o700)
            manifest, _ = fixture(root, NOW - dt.timedelta(days=7))
            with patch.object(Path, 'cwd', return_value=workspace), patch.object(local.dt, 'datetime', Clock):
                proof = local.main({'action': 'check', 'projectBinding': PROJECT,
                                    'serverObservedAt': (NOW - dt.timedelta(seconds=1)).isoformat()})
            self.assertEqual(proof['expiredArchives'], 0)
            self.assertTrue((root / (manifest['runId'] + '-managed.dump.age')).exists())

    def test_finished_tombstone_can_move_but_still_prevents_resurrection(self):
        manifest, files = fixture(self.root, NOW - dt.timedelta(days=8))
        local.expire(self.root, PROJECT, NOW, True)
        with tempfile.TemporaryDirectory() as temp:
            copied = Path(temp).resolve() / 'copied'
            shutil.copytree(self.root, copied)
            self.assertEqual(local.expire(copied, PROJECT, NOW)['removedFiles'], 0)
            self.assertEqual(local.expire(copied, PROJECT, NOW)['expiredArchives'], 1)
            with self.assertRaises(ValueError):
                local.store(copied, PROJECT, NOW - dt.timedelta(days=8), manifest, files)
            fresh, fresh_files = fixture(copied, NOW, suffix='87654321', write=False)
            local.store(copied, PROJECT, NOW, fresh, fresh_files)
            self.assertEqual(local.read_bundle(copied, PROJECT, NOW)['manifest'], fresh)

    def test_partial_expiry_cannot_move_to_another_root(self):
        fixture(self.root, NOW - dt.timedelta(days=8))
        with patch.object(os, 'unlink', side_effect=RuntimeError('interrupt')), self.assertRaises(RuntimeError):
            local.expire(self.root, PROJECT, NOW, True)
        with tempfile.TemporaryDirectory() as temp:
            copied = Path(temp).resolve() / 'copied'
            shutil.copytree(self.root, copied)
            with self.assertRaises(ValueError):
                local.expire(copied, PROJECT, NOW, True)
            self.assertEqual(sum(p.name.endswith('.age') for p in copied.iterdir()), 2)

    def test_new_capture_supersedes_attested_old_pending_pointer(self):
        old, old_files = fixture(self.root, NOW - dt.timedelta(hours=1), write=False)
        local.store(self.root, PROJECT, NOW, old, old_files)
        local.exclusive_write(self.root / 'managed-backup-latest.pending.json', local.encoded({'runId': old['runId']}))
        new, new_files = fixture(self.root, NOW, write=False)
        local.store(self.root, PROJECT, NOW, new, new_files)
        self.assertEqual(local.read_bundle(self.root, PROJECT, NOW)['manifest'], new)
        self.assertFalse((self.root / 'managed-backup-latest.pending.json').exists())

    def test_torn_or_unknown_pending_pointer_and_empty_manifest_block(self):
        manifest, files = fixture(self.root, NOW, write=False)
        local.store(self.root, PROJECT, NOW, manifest, files)
        pending = self.root / 'managed-backup-latest.pending.json'
        local.exclusive_write(pending, b'{')
        with self.assertRaises(ValueError):
            local.store(self.root, PROJECT, NOW, manifest, files)
        pending.write_bytes(local.encoded({'runId': '../foreign'}))
        with self.assertRaises(ValueError):
            local.store(self.root, PROJECT, NOW, manifest, files)
        (self.root / (manifest['runId'] + '-manifest.json')).write_bytes(b'')
        with self.assertRaises(ValueError):
            local.expire(self.root, PROJECT, NOW + dt.timedelta(days=8), True)

    def test_main_exact_request_and_both_clock_rule_before_lock(self):
        for request in [{'action': 'apply', 'projectBinding': PROJECT, 'root': '../foreign'},
                        {'action': 'check', 'projectBinding': PROJECT, 'serverObservedAt': NOW.replace(tzinfo=None).isoformat()},
                        {'action': 'check', 'projectBinding': PROJECT, 'serverObservedAt': (NOW + dt.timedelta(days=1)).isoformat()}]:
            with patch.object(local, 'local_lock') as lock, self.assertRaises(ValueError):
                local.main(request)
            lock.assert_not_called()

    def test_metadata_retains_completed_manifest_and_attests_server_only_expired_run(self):
        manifest, _ = fixture(self.root, NOW - dt.timedelta(days=8), write=False)
        local.attest(self.root, PROJECT, NOW, {manifest['runId']: manifest})
        self.assertFalse(any(p.name.endswith('.age') for p in self.root.iterdir()))
        self.assertEqual(local.metadata(self.root, PROJECT, NOW)['expectedManifests'], {manifest['runId']: manifest})
        self.assertEqual(local.expire(self.root, PROJECT, NOW, True)['removedFiles'], 0)
        self.assertEqual(local.metadata(self.root, PROJECT, NOW)['expectedManifests'], {manifest['runId']: manifest})

    def test_attestation_conflict_validates_whole_batch_before_metadata_write(self):
        known, _ = fixture(self.root, NOW)
        unknown, _ = fixture(self.root, NOW, suffix='87654321', write=False)
        manifests = {unknown['runId']: unknown, known['runId']: {**known, 'sourceCommit': 'c' * 40}}
        with self.assertRaises(ValueError):
            local.attest(self.root, PROJECT, NOW, manifests)
        self.assertFalse((self.root / local.JOURNAL).exists())

    def test_downloading_older_fresh_run_never_moves_latest_pointer_backwards(self):
        new, new_files = fixture(self.root, NOW, write=False)
        old, old_files = fixture(self.root, NOW - dt.timedelta(hours=1), write=False)
        local.store(self.root, PROJECT, NOW, new, new_files)
        proof = local.store(self.root, PROJECT, NOW, old, old_files)
        self.assertTrue(proof['latestPointerPreserved'])
        self.assertEqual(local.read_bundle(self.root, PROJECT, NOW)['manifest'], new)
        self.assertIn(old['runId'], local.metadata(self.root, PROJECT, NOW)['completeRuns'])

    def test_expiry_hash_work_scales_linearly_for_multiple_archives(self):
        reads = []
        actual = local.safe_read
        for count in (1, 8):
            with tempfile.TemporaryDirectory() as name:
                root = Path(name).resolve()
                root.chmod(0o700)
                for i in range(count):
                    fixture(root, NOW - dt.timedelta(days=8), suffix=f'{i:08x}')
                calls = []

                def read(path, *args, **kwargs):
                    if path.name.endswith('.age'):
                        calls.append(path)
                    return actual(path, *args, **kwargs)

                with patch.object(local, 'safe_read', side_effect=read):
                    proof = local.expire(root, PROJECT, NOW, True)
                self.assertEqual(proof['removedFiles'], 3 * count)
                reads.append(len(calls))
        self.assertLessEqual(reads[1], 10 * reads[0])


if __name__ == '__main__':
    unittest.main()
