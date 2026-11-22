"""Plan 055 F2a: pure parts of the offsite copy and restore check."""
import datetime as dt
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'prod_offsite', Path(__file__).resolve().parents[2] / 'scripts/prod/offsite.py')
offsite = importlib.util.module_from_spec(spec)
spec.loader.exec_module(offsite)


class OffsiteTests(unittest.TestCase):
    def test_only_new_backup_directories_are_copied(self):
        remote = ['20261201T031500Z-aaaaaaaa', '20261202T031500Z-bbbbbbbb', 'junk', '../etc']
        self.assertEqual(offsite.to_copy(remote, {'20261201T031500Z-aaaaaaaa'}),
                         ['20261202T031500Z-bbbbbbbb'])

    def test_local_copies_are_kept_fourteen_days_and_the_newest_always(self):
        now = dt.datetime(2026, 12, 20, tzinfo=dt.timezone.utc)
        names = ['20261201T031500Z-aaaaaaaa', '20261210T031500Z-bbbbbbbb']
        self.assertEqual(offsite.local_expired(names, now), ['20261201T031500Z-aaaaaaaa'])
        self.assertEqual(offsite.local_expired(['20261101T031500Z-aaaaaaaa'], now), [])

    def test_a_copy_must_match_its_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = '20261201T031500Z-aaaaaaaa'
            d = Path(tmp) / run
            d.mkdir()
            data = b'encrypted'
            (d / 'application.dump.age').write_bytes(data)
            manifest = {'schemaVersion': 'alterward-prod-backup-1', 'runId': run,
                        'encryptedFiles': {'application.dump.age': {
                            'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data)}}}
            (d / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(offsite.verify_copy(d)['runId'], run)
            (d / 'application.dump.age').write_bytes(b'tampered!')
            with self.assertRaises(ValueError):
                offsite.verify_copy(d)


if __name__ == '__main__':
    unittest.main()
