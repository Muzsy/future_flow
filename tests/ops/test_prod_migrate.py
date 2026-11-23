"""Plan 055: the planned database migration step on the new host (no Docker, no database)."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prod_migrate', ROOT / 'scripts/prod/migrate.py')
migrate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migrate)
SQL = b"CREATE TABLE aw_example (id uuid PRIMARY KEY);\nALTER TABLE aw_example ENABLE ROW LEVEL SECURITY;\n"


class MigrateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = Path(self.tmp.name) / 'app'
        (self.app / 'database/migrations').mkdir(parents=True)
        (self.app / 'database/migrations/099_example.sql').write_bytes(SQL)
        self.patches = [mock.patch.object(migrate, 'APP', self.app),
                        mock.patch.object(migrate, 'ROOT', Path(self.tmp.name))]
        for patch in self.patches:
            patch.start()

    def tearDown(self):
        for patch in self.patches:
            patch.stop()
        self.tmp.cleanup()

    def test_the_card_names_the_file_hash_and_statements(self):
        number, data, text, card = migrate.plan('database/migrations/099_example.sql')
        self.assertEqual(number, '099')
        self.assertIn(migrate.sha(SQL), text)
        self.assertIn('`CREATE TABLE aw_example (id uuid PRIMARY KEY)`', text)
        self.assertIn('Statements (2)', text)
        self.assertEqual(card, migrate.plan('database/migrations/099_example.sql')[3])

    def test_only_migration_paths_are_accepted(self):
        for bad in ('database/migrations/../secrets/x.sql', 'scripts/x.sql', 'database/migrations/41_x.sql',
                    '/etc/passwd'):
            with self.assertRaises(ValueError):
                migrate.plan(bad)

    def test_apply_needs_the_approved_card_and_always_leaves_a_receipt(self):
        with mock.patch.dict(os.environ, {'ALTERWARD_TEST_SKIP_BACKUP': '1'}), \
                mock.patch.object(migrate.release, 'ROOT', Path(self.tmp.name)):
            with self.assertRaises(ValueError):
                migrate.apply('database/migrations/099_example.sql', '0' * 64)
            card = migrate.plan('database/migrations/099_example.sql')[3]
            with mock.patch.object(migrate, 'run_sql') as run_sql:
                receipt = migrate.apply('database/migrations/099_example.sql', card)
            sent = run_sql.call_args.args[0]
            self.assertTrue(sent.startswith(SQL))
            self.assertIn(b"INSERT INTO ff_migrations(name, checksum) VALUES ('099_example.sql', '"
                          + migrate.app_checksum(SQL).encode() + b"')", sent)
            self.assertEqual(receipt['outcome'], 'applied')
            self.assertEqual(receipt['fileSha256'], migrate.sha(SQL))
            with mock.patch.object(migrate, 'run_sql', side_effect=RuntimeError('Migration failed and was rolled back')):
                with self.assertRaises(RuntimeError):
                    migrate.apply('database/migrations/099_example.sql', card)
        receipts = sorted((Path(self.tmp.name) / 'releases').glob('migration-099-*.json'))
        outcomes = sorted(json.loads(p.read_text())['outcome'] for p in receipts)
        self.assertEqual(outcomes, ['applied', 'failed'])  # the failure never overwrites the success

    def test_the_production_root_cannot_skip_the_restore_check(self):
        with mock.patch.dict(os.environ, {'ALTERWARD_TEST_SKIP_BACKUP': '1'}), \
                mock.patch.object(migrate.release, 'ROOT', Path('/srv/alterward')), \
                mock.patch.object(migrate, 'ROOT', Path(self.tmp.name)), \
                mock.patch.object(migrate, 'run_sql') as run_sql:
            card = migrate.plan('database/migrations/099_example.sql')[3]
            with self.assertRaises(RuntimeError):
                migrate.apply('database/migrations/099_example.sql', card)
        run_sql.assert_not_called()

    def test_the_checksum_equals_the_application_runner_for_every_migration(self):
        import shutil, subprocess
        if not shutil.which('node'):
            self.skipTest('node not available')
        files = sorted((ROOT / 'database/migrations').glob('*.sql'))
        script = ("const fs=require('fs'),c=require('crypto');for(const f of process.argv.slice(1)){"
                  "const t=fs.readFileSync(f,'utf8').replace(/\\r\\n/g,'\\n');"
                  "console.log(c.createHash('sha256').update(JSON.stringify(t)).digest('hex'))}")
        out = subprocess.run(['node', '-e', script, *map(str, files)], capture_output=True, text=True,
                             check=True).stdout.split()
        self.assertEqual(out, [migrate.app_checksum(f.read_bytes()) for f in files])

    def test_record_needs_an_applied_receipt_for_the_same_bytes(self):
        with mock.patch.object(migrate.release, 'ROOT', Path(self.tmp.name)):
            card = migrate.record_card('database/migrations/099_example.sql')[3]
            with mock.patch.object(migrate, 'run_sql') as run_sql:
                with self.assertRaises(ValueError):
                    migrate.record('database/migrations/099_example.sql', card)
                run_sql.assert_not_called()
                releases = Path(self.tmp.name) / 'releases'
                releases.mkdir(exist_ok=True)
                (releases / 'migration-099-20261123T000000Z-aaaaaaaa.json').write_text(json.dumps(
                    {'file': 'database/migrations/099_example.sql', 'fileSha256': migrate.sha(SQL),
                     'outcome': 'applied'}))
                receipt = migrate.record('database/migrations/099_example.sql', card)
            self.assertEqual(receipt['outcome'], 'registered')
            self.assertTrue(run_sql.call_args.args[0].strip().startswith(b'INSERT INTO ff_migrations'))


if __name__ == '__main__':
    unittest.main()
