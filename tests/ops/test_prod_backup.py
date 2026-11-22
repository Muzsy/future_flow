"""Plan 055 F2a: pure parts of the production backup (no Docker, no network)."""
import datetime as dt
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    'prod_backup', Path(__file__).resolve().parents[2] / 'scripts/prod/backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class ProdBackupTests(unittest.TestCase):
    def test_env_values_lose_their_quotes_and_comments_are_skipped(self):
        values = backup.parse_env("# c\nA='x=y'\nB=\"$2a$14$abc\"\nC=plain\n\nbroken\n")
        self.assertEqual(values, {'A': 'x=y', 'B': '$2a$14$abc', 'C': 'plain'})

    def test_database_target_decodes_the_url_without_printing_it(self):
        target = backup.database_target('postgresql://postgres.ref:p%40ss@db.example:6543/postgres')
        self.assertEqual(target, {'host': 'db.example', 'port': '6543', 'database': 'postgres',
                                  'user': 'postgres.ref', 'password': 'p@ss'})
        with self.assertRaises(ValueError):
            backup.database_target('mysql://u:p@h/db')

    def test_the_config_archive_is_deterministic_and_lists_only_existing_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'secrets').mkdir()
            (root / 'secrets/server.env').write_text('A=1\n')
            first, hashes = backup.config_archive(root)
            second, _ = backup.config_archive(root)
            self.assertEqual(first, second)
            self.assertEqual(list(hashes), ['secrets/server.env'])
            names = tarfile.open(fileobj=io.BytesIO(first)).getnames()
            self.assertEqual(names, ['secrets/server.env'])

    def test_retention_keeps_seven_days_and_always_the_newest(self):
        now = dt.datetime(2026, 12, 20, tzinfo=dt.timezone.utc)
        names = ['20261201T031500Z-aaaaaaaa', '20261214T031500Z-bbbbbbbb',
                 '20261219T031500Z-cccccccc', 'not-a-backup']
        self.assertEqual(backup.expired(names, now), ['20261201T031500Z-aaaaaaaa'])
        self.assertEqual(backup.expired(['20261101T031500Z-aaaaaaaa'], now), [])


if __name__ == '__main__':
    unittest.main()
