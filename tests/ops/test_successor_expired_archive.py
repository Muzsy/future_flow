"""`--archive-expired` of an expired, never-attempted preparation, with the DAILY clock past expiry.

The earlier archive regressions froze the Daily clock before expiry, so the validator never
met the expired root. This is the production shape: four exposed successor generations and an
expired, journal-less fifth one (schema-040), also with its archive receipt already written
while the directory was not yet moved.
"""
import datetime as dt
import json
import sys
import unittest
from unittest.mock import Mock, patch

import test_beta_successor_chain as chained
import test_beta_successor_chain_root as base
from test_service_registry_protocol import observed

funded, daily, root = base.funded, base.daily, base.root


class ExpiredArchiveTests(base.ChainRootBase):
    def setUp(self):
        super().setUp()
        self.chain.admit_readers()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, value, window_changed=True)
        value = self.chain.prepare(4, 'schema-039')
        self.chain.expose(4, value, window_changed=False, schema=True)
        self.value = self.chain.prepare(5, 'schema-040', database=observed())
        self.digest = daily.digest(chained.encoded(self.value))
        self.fifth = self.chain.root(5)
        self.archive = self.fixture.owner / daily.SUCCESSOR_ARCHIVE_NAME
        self.expired = funded.stamp(self.value['expiresAt']) + dt.timedelta(minutes=1)
        for module, name, replacement in [(sys.modules['alterward_backup'], 'ROOT', self.fixture.owner),
                                          (funded.readers, 'durable_file', self.fixture.write)]:
            p = patch.object(module, name, replacement) if name == 'ROOT' else patch.object(module, name, side_effect=replacement)
            p.start()
            self.addCleanup(p.stop)

    def system(self):
        system = super().system('archive-expired', preparedSha256=self.digest, accessSnapshot={})
        system.archive_support = Mock()
        system.baseline = Mock(return_value=self.value['baseline'])
        system.now = Mock(return_value=self.expired)
        return system

    def expire(self):
        daily.utcnow.return_value = self.expired

    def test_an_expired_never_attempted_fifth_generation_is_archived_and_health_returns(self):
        self.expire()
        # Before the move the preparation is expired and the whole chain fails closed.
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        with self.assertRaisesRegex(ValueError, 'Expired successor preparation'):
            daily.successor_active_state()
        result = self.system().archive_expired()
        self.assertTrue(result['archived'])
        self.assertFalse(result['alreadyArchived'])
        self.assertEqual((result['databaseWrites'], result['paidAiCalls'], result['authorityChanged']), (0, 0, False))
        self.assertFalse(self.fifth.exists())
        self.assertTrue((self.archive / self.digest / 'prepared.json').exists())
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        state = daily.successor_active_state()
        self.assertEqual((state['generation'], state['directory'], state['pending']), (4, self.chain.root(4), None))
        self.assertTrue(daily.successor_archived_paths())
        # After the move the targeted root is the exposed tip: a repeat is refused, never a second move.
        with self.assertRaisesRegex(ValueError, 'Conflicting active and archived'):
            self.system().archive_expired()
        self.assertTrue((self.archive / self.digest / 'prepared.json').exists())

    def test_a_written_receipt_without_the_move_is_finished_by_the_retry(self):
        """The production state: archive.json present, directory not moved, retries stuck."""
        self.expire()
        with patch.object(root.os, 'rename', side_effect=OSError('synthetic: killed before the move')):
            with self.assertRaises(OSError):
                self.system().archive_expired()
        receipt = self.fifth / 'archive.json'
        self.assertTrue(receipt.exists() and self.fifth.exists())
        kept = receipt.read_bytes()
        # Monitor/backup derivations still work while the directory sits there; health stays red.
        self.assertIn(receipt, daily.funded_upgrade_config_paths())
        self.assertIn(receipt, daily.funded_upgrade_config_paths(immutable_only=True))
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        result = self.system().archive_expired()
        self.assertEqual((result['archived'], result['alreadyArchived']), (True, False))
        self.assertEqual((self.archive / self.digest / 'archive.json').read_bytes(), kept)  # receipt not rewritten
        self.assertFalse(self.fifth.exists())
        self.assertTrue(daily.funded_upgrade_healthy('personal-beta'))
        self.assertIn(self.archive / self.digest / 'archive.json', daily.funded_upgrade_config_paths(immutable_only=True))

    def test_the_receipt_must_be_the_original_one_after_expiry(self):
        self.expire()
        with patch.object(root.os, 'rename', side_effect=OSError('synthetic')):
            with self.assertRaises(OSError):
                self.system().archive_expired()
        path = self.fifth / 'archive.json'
        original = json.loads(path.read_bytes())
        for label, change in [('archived before expiry', {'archivedAt': (funded.stamp(self.value['expiresAt']) - dt.timedelta(seconds=1)).isoformat()}),
                              ('other prepared hash', {'preparedSha256': '0' * 64}),
                              ('other source', {'preparedSourceCommit': 'f' * 40}),
                              ('other files', {'files': {}})]:
            with self.subTest(label):
                self.fixture.write(path, chained.encoded({**original, **change}))
                with self.assertRaises(ValueError):
                    self.system().archive_expired()
                self.assertTrue(self.fifth.exists())
        self.fixture.write(path, chained.encoded(original))
        self.assertTrue(self.system().archive_expired()['archived'])

    def test_everything_else_stays_fail_closed(self):
        self.expire()
        # Not yet expired: refused by the archive precondition and, with the Daily clock before expiry,
        # the preparation is simply the pending one.
        system = self.system()
        system.now.return_value = funded.stamp(self.value['expiresAt']) - dt.timedelta(seconds=1)
        with self.assertRaises(ValueError):
            system.archive_expired()
        self.assertTrue(self.fifth.exists())
        # Another prepared hash.
        system = self.system()
        system.request['preparedSha256'] = '0' * 64
        with self.assertRaises(ValueError):
            system.archive_expired()
        # An attempted preparation (journal) is never archived, expired or not.
        self.chain.journal(5, ['apply-intent', 'held'])
        with self.assertRaises(ValueError):
            self.system().archive_expired()
        self.assertTrue(self.fifth.exists())
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))

    def test_an_expired_root_never_becomes_an_active_or_parent_authority(self):
        self.expire()
        with self.assertRaises(ValueError):
            daily.successor_active_state()
        with self.assertRaises(ValueError):
            daily.successor_parent_context(6)
        with self.assertRaises(ValueError):
            daily.active_funded_directory()
        self.assertFalse(daily.funded_upgrade_healthy('personal-beta'))
        # Not the archive path: the expiry error is the same plain ValueError family as before.
        with self.assertRaises(daily.SuccessorExpired):
            daily.successor_effective_role(self.value, self.fifth)

    def test_a_later_generation_cannot_hide_behind_an_expired_one(self):
        self.expire()
        self.fixture.write(self.chain.root(6) / 'prepared.json', b'{}')
        with self.assertRaises(ValueError):
            self.system().archive_expired()
        self.assertTrue(self.fifth.exists())

    def test_the_archive_cannot_adopt_a_root_whose_parent_is_not_the_exposed_tip(self):
        self.expire()
        path = self.fifth / 'prepared.json'
        value = json.loads(path.read_bytes())
        value['parentPreparedSha256'] = '0' * 64
        self.fixture.write(path, chained.encoded(value))
        system = self.system()
        system.request['preparedSha256'] = daily.digest(chained.encoded(value))
        with self.assertRaises(ValueError):
            system.archive_expired()
        self.assertTrue(self.fifth.exists())


if __name__ == '__main__':
    unittest.main()
