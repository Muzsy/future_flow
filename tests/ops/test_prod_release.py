"""Plan 055 F2b: pure parts of the production release (no Docker)."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest import mock

spec = importlib.util.spec_from_file_location(
    'prod_release', Path(__file__).resolve().parents[2] / 'scripts/prod/release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
A = 'sha256:' + 'a' * 64
COMMIT = 'c' * 40


class ReleaseTests(unittest.TestCase):
    def test_only_the_image_line_changes(self):
        text = "# x\nDATABASE_URL='postgres://u:p@h/db'\nALTERWARD_IMAGE=old\nZ=1\n"
        out = release.with_image(text, '127.0.0.1:5000/alterward@' + A)
        self.assertEqual(out.splitlines(), ['# x', "DATABASE_URL='postgres://u:p@h/db'",
                                            'ALTERWARD_IMAGE=127.0.0.1:5000/alterward@' + A, 'Z=1'])
        self.assertEqual(release.read_env_image(out), '127.0.0.1:5000/alterward@' + A)
        self.assertTrue(release.with_image('A=1\n', 'x').endswith('ALTERWARD_IMAGE=x\n'))

    def test_the_card_is_deterministic_and_names_signature_and_previous(self):
        first = release.card_text(A, COMMIT, 230, 'prev', True)
        self.assertEqual(first, release.card_text(A, COMMIT, 230, 'prev', True))
        self.assertIn('PR #230', first)
        self.assertIn('verified', first)
        self.assertIn('`prev`', first)
        self.assertNotEqual(first, release.card_text(A, COMMIT, 230, 'other', True))

    def test_health_needs_every_service_running_and_web_api_healthy(self):
        good = {'web': {'Running': True, 'Health': {'Status': 'healthy'}},
                'api': {'Running': True, 'Health': {'Status': 'healthy'}},
                'worker': {'Running': True}}
        self.assertTrue(release.healthy(good))
        self.assertFalse(release.healthy({**good, 'api': {'Running': True, 'Health': {'Status': 'starting'}}}))
        self.assertFalse(release.healthy({**good, 'worker': None}))

    def test_plan_rejects_malformed_inputs_before_touching_docker(self):
        for image, commit, pr in [('latest', COMMIT, 1), (A, 'abc', 1), (A, COMMIT, 'x')]:
            with self.assertRaises(ValueError):
                release.plan(image, commit, pr)

    def test_production_root_can_never_skip_the_backup(self):
        with mock.patch.dict(os.environ, {'ALTERWARD_TEST_SKIP_BACKUP': '1'}):
            with mock.patch.object(release, 'ROOT', Path('/srv/alterward')):
                self.assertFalse(release.skip_backup_for_test())
            with mock.patch.object(release, 'ROOT', Path('/tmp/release-test')):
                self.assertTrue(release.skip_backup_for_test())

    def test_a_switch_needs_a_recent_verified_restore(self):
        import datetime as dt
        now = dt.datetime(2026, 12, 1, 12, 0, tzinfo=dt.timezone.utc)
        good = {'ok': True, 'runId': 'r', 'backupCapturedAt': '2026-12-01T11:00:00+00:00',
                'checkedAt': '2026-12-01T11:20:00+00:00'}
        self.assertTrue(release.restore_recent(good, now))
        self.assertFalse(release.restore_recent({**good, 'ok': False}, now))
        self.assertFalse(release.restore_recent({**good, 'backupCapturedAt': '2026-12-01T09:00:00+00:00'}, now))
        self.assertFalse(release.restore_recent({**good, 'checkedAt': '2026-12-01T10:00:00+00:00'}, now))
        self.assertFalse(release.restore_recent({**good, 'backupCapturedAt': '2026-12-01T11:00:00'}, now))
        self.assertFalse(release.restore_recent({}, now))


if __name__ == '__main__':
    unittest.main()
