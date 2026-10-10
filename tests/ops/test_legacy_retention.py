"""Finite historical ciphertext fixtures and interrupted JSON replacements."""
import base64
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import test_local_managed_recovery as reviewed

sys.modules['alterward_managed_local'] = reviewed.local
spec = importlib.util.spec_from_file_location('legacy_retention', Path(__file__).resolve().parents[2] / 'scripts/ops/legacy-recovery-retention.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
NOW = dt.datetime(2026, 10, 10, 17, tzinfo=dt.timezone.utc)


class LegacyRetentionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.home = Path(self.temporary.name).resolve()
        self.root = self.home / 'copies';self.meta = self.home / 'metadata'
        self.root.mkdir(mode=0o700);self.meta.mkdir(mode=0o700)

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, path, data):
        legacy.exclusive_write(path, data)

    def fixture(self, side='local', captured=None):
        captured = captured or NOW - dt.timedelta(days=8)
        run = captured.strftime('%Y%m%dT%H%M%SZ') + '-12345678'
        cipher = b'age-encryption.org/v1\nsynthetic test ciphertext only\n'
        scope = 'proxy-tls-owner-config-no-database'
        record = {'runId': run, 'scope': scope, 'baseAt': captured.isoformat(),
                  'expiresAt': (captured + dt.timedelta(days=7)).isoformat(),
                  'timestampEvidence': 'named-operation-start-conservative',
                  'directory': 'owner-config-' + run if side == 'server' else None, 'files': []}
        parent = self.root / record['directory'] if record['directory'] else self.root
        if side == 'server':
            parent.mkdir(mode=0o700)
            manifest = {'schemaVersion': 'alterward-owner-config-backup-1', 'runId': run, 'scope': scope,
                        'cipherSha256': legacy.sha(cipher), 'cipherBytes': len(cipher)}
            for name, data in [('owner-config.tar.age', cipher), ('manifest.json', legacy.encoded(manifest))]:
                self.write(parent / name, data)
                record['files'].append({'name': name, 'field': None, 'sha256': legacy.sha(data), 'bytes': len(data)})
        else:
            for name, field in legacy.JSON_FIELDS.items():
                data = legacy.encoded({field: base64.b64encode(cipher).decode(), 'keep': {'list': [1, False, None], 'text': 'unaltered values'}})
                self.write(parent / name, data)
                record['files'].append({'name': name, 'field': field, 'sha256': legacy.sha(cipher), 'bytes': len(cipher)})
            self.write(parent / 'owner-config-latest.tar.age', cipher)
            record['files'].append({'name': 'owner-config-latest.tar.age', 'field': None, 'sha256': legacy.sha(cipher), 'bytes': len(cipher)})
        legacy.enrollment(self.meta, self.root, side, [record], NOW)
        return record, parent

    def test_fresh_check_and_apply_preserve_all_files_and_create_no_intent(self):
        record, _ = self.fixture(captured=NOW)
        before = {p.name: p.read_bytes() for p in self.root.iterdir()}
        for apply in (False, True):
            proof = legacy.expire(self.meta, self.root, NOW, apply)
            self.assertEqual(proof['expiredRuns'], 0)
            self.assertEqual(proof['filesRemoved'], 0)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir()})
        self.assertFalse((self.meta / 'intents').exists())

    def test_exact_boundary_removes_only_ciphertexts_and_embedded_fields(self):
        record, _ = self.fixture(captured=NOW - dt.timedelta(days=7))
        proof = legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(proof['filesRemoved'], 1)
        self.assertEqual(proof['embeddedFieldsRemoved'], 4)
        for name, field in legacy.JSON_FIELDS.items():
            value = json.loads((self.root / name).read_bytes())
            self.assertNotIn(field, value)
            self.assertEqual(value['keep'], {'list': [1, False, None], 'text': 'unaltered values'})
        again = legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(again['filesRemoved'] + again['embeddedFieldsRemoved'], 0)

    def test_json_replace_interruption_is_resumable_without_original_cipher_copy(self):
        record, _ = self.fixture()
        actual = os.replace
        def stop(a, b):
            actual(a, b)
            raise InterruptedError('Synthetic stop just after atomic replacement')
        with patch.object(os, 'replace', side_effect=stop), self.assertRaises(InterruptedError):
            legacy.expire(self.meta, self.root, NOW, True)
        proof = legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(proof['embeddedFieldsRemoved'], 3)
        self.assertFalse(any(p.name.endswith('.pending') for p in self.meta.iterdir()))

    def test_pending_json_written_before_replace_can_be_reused(self):
        self.fixture()
        with patch.object(os, 'replace', side_effect=InterruptedError('Synthetic stop before replace')), self.assertRaises(InterruptedError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(sum(p.name.endswith('.pending') for p in self.meta.iterdir()), 1)
        proof = legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(proof['embeddedFieldsRemoved'], 4)
        self.assertFalse(any(p.name.endswith('.pending') for p in self.meta.iterdir()))

    def test_server_unlinks_resume_and_manifest_is_last(self):
        record, parent = self.fixture('server')
        actual = os.unlink;calls = []
        def stop(path, *args, **kwargs):
            calls.append(Path(path).name)
            actual(path, *args, **kwargs)
            raise InterruptedError('Synthetic stop after original unlink')
        with patch.object(os, 'unlink', side_effect=stop), self.assertRaises(InterruptedError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(calls, ['owner-config.tar.age'])
        self.assertTrue((parent / 'manifest.json').exists())
        proof = legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(proof['filesRemoved'], 1)
        self.assertEqual(proof['emptyDirectoriesRemoved'], 1)
        self.assertFalse(parent.exists())

    @unittest.skipIf(os.name == 'nt', 'Linux no-follow directory descriptor')
    def test_swapped_parent_is_refused_before_original_unlink(self):
        record, parent = self.fixture('server')
        original = parent.with_name(parent.name + '-original')
        replacement = self.home / 'replacement';replacement.mkdir(mode=0o700)
        actual = os.open
        changed = False
        def swap(path, *args, **kwargs):
            nonlocal changed
            if Path(path) == parent and not changed:
                changed = True;parent.rename(original);parent.symlink_to(replacement, target_is_directory=True)
            return actual(path, *args, **kwargs)
        with patch.object(os, 'open', side_effect=swap), self.assertRaises(OSError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertTrue((original / 'owner-config.tar.age').exists())
        self.assertTrue((original / 'manifest.json').exists())
        self.assertEqual(list(replacement.iterdir()), [])

    def test_empty_server_directory_after_interruption_can_finish(self):
        record, parent = self.fixture('server')
        with patch.object(os, 'rmdir', side_effect=InterruptedError('Synthetic stop before empty rmdir')), self.assertRaises(InterruptedError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(list(parent.iterdir()), [])
        self.assertEqual(legacy.expire(self.meta, self.root, NOW, True)['emptyDirectoriesRemoved'], 1)

    def test_failed_intent_write_precedes_every_mutation(self):
        self.fixture()
        before = {p.name: p.read_bytes() for p in self.root.iterdir()}
        with patch.object(legacy, 'exclusive_write', side_effect=OSError('Synthetic durable intent failure')), self.assertRaises(OSError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual(before, {p.name: p.read_bytes() for p in self.root.iterdir()})

    def test_torn_intent_blocks_with_all_ciphertexts_preserved(self):
        record, _ = self.fixture()
        intents = self.meta / 'intents';intents.mkdir(mode=0o700)
        self.write(intents / (record['runId'] + '.json'), b'{')
        with self.assertRaises(ValueError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertTrue((self.root / 'owner-config-latest.tar.age').exists())

    def test_changed_json_other_fields_block_whole_batch_before_intents(self):
        self.fixture()
        name = next(iter(legacy.JSON_FIELDS))
        value = json.loads((self.root / name).read_bytes());value['keep']['text'] = 'changed'
        (self.root / name).write_bytes(legacy.encoded(value))
        with self.assertRaises(ValueError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertFalse((self.meta / 'intents').exists())
        self.assertTrue((self.root / 'owner-config-latest.tar.age').exists())

    def test_resurrected_standalone_cipher_never_gets_a_second_delete(self):
        self.fixture()
        original = (self.root / 'owner-config-latest.tar.age').read_bytes()
        legacy.expire(self.meta, self.root, NOW, True)
        self.write(self.root / 'owner-config-latest.tar.age', original)
        with self.assertRaises(ValueError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertTrue((self.root / 'owner-config-latest.tar.age').exists())

    def test_mismatched_existing_enrollment_is_not_overwritten(self):
        record, _ = self.fixture(captured=NOW)
        record['files'][0]['sha256'] = 'a' * 64
        before = (self.meta / 'enrollment.json').read_bytes()
        with self.assertRaises(ValueError):
            legacy.enrollment(self.meta, self.root, 'local', [record], NOW)
        self.assertEqual((self.meta / 'enrollment.json').read_bytes(), before)

    def test_unrelated_files_remain_and_extra_server_entry_blocks(self):
        record, parent = self.fixture('server')
        self.write(parent / 'foreign', b'unrelated')
        with self.assertRaises(ValueError):
            legacy.expire(self.meta, self.root, NOW, True)
        self.assertEqual((parent / 'foreign').read_bytes(), b'unrelated')
        self.assertTrue((parent / 'owner-config.tar.age').exists())

    def test_malformed_scope_paths_or_json_fields_are_rejected(self):
        record, _ = self.fixture(captured=NOW)
        for mutate in [lambda r: r.update(directory='../foreign'), lambda r: r['files'][0].update(name='../foreign'),
                       lambda r: r['files'][0].update(field='identity'), lambda r: r.update(scope='unknown'),
                       lambda r: r.update(expiresAt=(NOW + dt.timedelta(days=8)).isoformat())]:
            changed = json.loads(json.dumps(record));mutate(changed)
            with self.assertRaises(ValueError):
                legacy.validate_records([changed], 'local', NOW)

    def test_unjournaled_missing_file_and_unknown_intent_fail_closed(self):
        record, _ = self.fixture()
        (self.root / 'owner-config-latest.tar.age').unlink()
        with self.assertRaises(ValueError):
            legacy.expire(self.meta, self.root, NOW, True)

    def test_peer_clock_guard_rejects_stale_or_non_utc_before_any_location_read(self):
        for stamp in ['2000-01-01T00:00:00Z', '2026-10-10T19:00:00+02:00']:
            with patch.object(legacy, 'location') as reader, self.assertRaises(ValueError):
                legacy.main({'action': 'apply', 'side': 'local', 'peerObservedAt': stamp})
            reader.assert_not_called()
