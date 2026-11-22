"""Plan 055 F2b: the operator-side release gate (no network, no SSH)."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    'prod_ship', Path(__file__).resolve().parents[2] / 'scripts/prod/ship.py')
ship = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ship)
A = 'sha256:' + 'a' * 64
C = 'c' * 40
B = 'b' * 40
CI = '.github/workflows/ci.yml'


class ShipTests(unittest.TestCase):
    def test_ci_verdict(self):
        ok = {'path': CI, 'status': 'completed', 'conclusion': 'success'}
        self.assertEqual(ship.ci_verdict([]), 'missing')
        self.assertEqual(ship.ci_verdict([{'path': '.github/workflows/other.yml', **{}}]), 'missing')
        self.assertEqual(ship.ci_verdict([ok, ok]), 'success')
        self.assertEqual(ship.ci_verdict([ok, {'path': CI, 'status': 'in_progress'}]), 'running')
        self.assertEqual(ship.ci_verdict([ok, {'path': CI, 'status': 'completed', 'conclusion': 'failure'}]),
                         'failed')

    def test_any_migration_change_is_found(self):
        out = ('A\tdatabase/migrations/041_new.sql\nM\tdatabase/migrations/040_x.sql\n'
               'R100\tdatabase/migrations/a.sql\tdatabase/migrations/b.sql\nM\tapps/web/x.ts\n'
               'M\tdatabase/migrations_notes.md')
        self.assertEqual(ship.schema_changes(out), ['database/migrations/041_new.sql',
                                                    'database/migrations/040_x.sql', 'database/migrations/b.sql'])
        self.assertEqual(ship.schema_changes(''), [])

    def test_serving_commit_is_the_newest_released_receipt(self):
        receipts = [('20261201T100000Z.json', {'outcome': 'released', 'commit': B}),
                    ('20261202T100000Z.json', {'outcome': 'rolled-back', 'commit': C}),
                    ('20261130T100000Z.json', {'outcome': 'released', 'commit': 'd' * 40})]
        self.assertEqual(ship.serving_commit(receipts), B)
        self.assertIsNone(ship.serving_commit([('20261202T100000Z.json', {'outcome': 'rolled-back', 'commit': C})]))

    def test_inputs_are_validated_before_anything_runs(self):
        with mock.patch.object(ship, 'run') as run, mock.patch('builtins.print'):
            self.assertEqual(ship.main(['--commit', 'abc', '--pr', '1', '--image', A]), 1)
            self.assertEqual(ship.main(['--commit', C, '--pr', '1', '--image', A, '--approve', 'x']), 1)
            self.assertEqual(ship.main(['--commit', C, '--pr', '0', '--image', A]), 1)
        run.assert_not_called()

    def test_a_migration_change_stops_before_the_host(self):
        def fake_git(*args):
            if args[0] == 'diff':
                return 'A\tdatabase/migrations/041_new.sql'
            return ''
        printed = []
        with mock.patch.object(ship, 'git', side_effect=fake_git), \
                mock.patch.object(ship, 'ci_green', return_value='release commit'), \
                mock.patch.object(ship, 'host_receipts', return_value=[]), \
                mock.patch.object(ship, 'remote_release') as remote, \
                mock.patch('builtins.print', side_effect=printed.append):
            self.assertEqual(ship.main(['--commit', C, '--pr', '9', '--image', A, '--base', B]), 1)
        remote.assert_not_called()
        self.assertIn('migrations', printed[-1])

    def test_the_first_release_needs_a_base_and_receipts_win(self):
        with mock.patch.object(ship, 'git', return_value=''), \
                mock.patch.object(ship, 'ci_green', return_value='release commit'), \
                mock.patch.object(ship, 'remote_release', return_value=(0, 'card\n')) as remote, \
                mock.patch.object(ship, 'verified_backup',
                                  return_value={'runId': 'r', 'tables': 2, 'rows': 3}) as backup, \
                mock.patch('builtins.print'):
            with mock.patch.object(ship, 'host_receipts', return_value=[]):
                self.assertEqual(ship.main(['--commit', C, '--pr', '9', '--image', A]), 1)
                self.assertEqual(ship.main(['--commit', C, '--pr', '9', '--image', A, '--base', B]), 0)
            released = [('20261201T100000Z.json', {'outcome': 'released', 'commit': B})]
            with mock.patch.object(ship, 'host_receipts', return_value=released):
                self.assertEqual(ship.main(['--commit', C, '--pr', '9', '--image', A, '--base', 'd' * 40]), 1)
                self.assertEqual(ship.main(['--commit', C, '--pr', '9', '--image', A,
                                            '--approve', 'e' * 64]), 0)
        self.assertEqual(remote.call_args_list[-1].args, ('apply', A, C, '9', 'e' * 64))
        backup.assert_called_once()  # only the approved switch backs up and test-restores first
        self.assertEqual(remote.call_args_list[0].args, ('plan', A, C, '9', None))


if __name__ == '__main__':
    unittest.main()
