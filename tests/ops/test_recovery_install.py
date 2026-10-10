"""Local-copy acknowledgement cannot clear a stale/failure or wrong inventory."""
import datetime as dt
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('recovery_install', Path(__file__).resolve().parents[2] / 'scripts/ops/contabo-recovery-install.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)
NOW = dt.datetime(2026, 10, 10, 21, tzinfo=dt.timezone.utc)


class LocalAttestationTests(unittest.TestCase):
    def setUp(self):
        self.config = {'sourceCommit': 'a'*40, 'projectBinding': 'b'*64}
        self.request = {'action': 'record-local', 'ok': True, 'sourceCommit': 'c'*40,
                        'observedAt': NOW.isoformat(), 'managedArchives': 2, 'legacyPolicyDigest': 'd'*64}
        self.daily = Mock();self.daily.utcnow.return_value = NOW
        self.expiry = Mock();self.expiry.catalog.return_value = {'freshRuns': ['first', 'second']}
        self.legacy = Mock();self.legacy.expire.return_value = {'policyDigest': 'd'*64}

    def call(self, **update):
        return installer.local_attestation({**self.request, **update}, self.config, self.daily, self.expiry, self.legacy)

    def test_exact_fresh_attestation_is_bound_to_installed_source_not_new_timer_activation(self):
        value = self.call()
        self.assertTrue(value['ok'])
        self.assertEqual(value['installedSourceCommit'], self.config['sourceCommit'])
        self.assertEqual(value['localSourceCommit'], self.request['sourceCommit'])
        self.assertNotIn('timerActivated', value)

    def test_old_future_mistyped_private_or_wrong_inventory_refused(self):
        for update in [{'observedAt': (NOW-dt.timedelta(seconds=301)).isoformat()},
                       {'observedAt': (NOW+dt.timedelta(seconds=1)).isoformat()},
                       {'ok': 'true'}, {'managedArchives': True}, {'managedArchives': 0},
                       {'managedArchives': 1}, {'legacyPolicyDigest': 'e'*64},
                       {'privateKey': 'must not be accepted'}]:
            with self.subTest(update=update), self.assertRaises(ValueError):
                self.call(**update)

    def test_failure_receipt_stays_failed_even_without_successful_inventory(self):
        value = self.call(ok=False, managedArchives=0, legacyPolicyDigest='0'*64)
        self.assertFalse(value['ok'])
        self.expiry.catalog.assert_not_called();self.legacy.expire.assert_not_called()

    def test_new_server_capture_between_copy_and_receipt_blocks_false_fresh_success(self):
        self.expiry.catalog.return_value = {'freshRuns': ['first', 'second', 'third']}
        with self.assertRaises(ValueError):
            self.call()


if __name__ == '__main__':
    unittest.main()
