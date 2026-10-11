import datetime as dt
import importlib.util
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


load('alterward_backup', 'contabo-backup.py')
daily = load('personal_transition_daily', 'contabo-daily.py')


class PersonalTransitionMonitorTests(unittest.TestCase):
    def check(self, mode, state=None, exposed=False, preparation=b'exact synthetic preparation', digest=None):
        expected = daily.digest(preparation)
        def exists(path):
            if path.name == 'personal-beta':
                return state is not None or exposed
            if path.name == 'transition.json':
                return state is not None
            if path.name == 'journal.json':
                return exposed
            return False
        def contents(path):
            if path.name == 'prepared.json':
                return preparation
            value = {'state': 'exposure-committed' if path.name == 'journal.json' else state,
                     'preparedSha256': digest or expected}
            return json.dumps(value).encode()
        with patch.object(Path, 'exists', autospec=True, side_effect=exists), \
             patch.object(Path, 'is_symlink', return_value=False), \
             patch.object(daily, 'personal_config_paths', return_value=[]), \
             patch.object(daily, 'regular', side_effect=contents):
            return daily.personal_transition_healthy(mode)

    def test_owner_without_funding_state_is_healthy_but_funded_without_it_is_not(self):
        self.assertTrue(self.check('owner'))
        self.assertFalse(self.check('personal-beta'))

    def test_kill_before_or_after_exposure_is_unhealthy_in_either_runtime_mode(self):
        for mode in ['owner', 'personal-beta']:
            for state in ['applying', 'held', 'recovery-required']:
                for exposed in [False, True]:
                    self.assertFalse(self.check(mode, state, exposed))

    def test_only_matching_applied_exposure_or_verified_zero_terminal_is_healthy(self):
        self.assertTrue(self.check('personal-beta', 'applied', True))
        self.assertFalse(self.check('personal-beta', 'applied', True, digest='b' * 64))
        self.assertFalse(self.check('personal-beta', 'applied', False))
        self.assertFalse(self.check('owner', 'applied', True))
        for state in ['disabled', 'disabled-after-failure']:
            self.assertTrue(self.check('owner', state, True))
            self.assertFalse(self.check('personal-beta', state, True))

    def test_incomplete_transition_adds_a_separate_monitor_alert(self):
        now = dt.datetime.now(dt.timezone.utc)
        health = {'ownerHealthy': True, 'databaseTlsVerified': True, 'pendingJobs': 0,
                  'anonymousDenied': 4, 'edgeClosed': True, 'diskFreeBytes': 3 * 1024**3,
                  'originCertificateOver30Days': True, 'lastBackupAt': now.isoformat(),
                  'personalTransitionHealthy': False}
        self.assertEqual(daily.alerts_for(health, now), ['personal_transition_incomplete'])

    def test_unreadable_private_evidence_is_reported_without_recovery_or_actuation(self):
        with patch.object(Path, 'exists', return_value=True), \
             patch.object(daily, 'personal_config_paths', side_effect=ValueError('private contents hidden')):
            self.assertFalse(daily.personal_transition_healthy('personal-beta'))


if __name__ == '__main__':
    unittest.main()
