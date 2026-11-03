"""Daily's backup catalog and monitor facts for the service record and operator journal."""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, directory / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


library = load('alterward_backup', 'contabo-backup.py')
daily = load('daily_for_service_evidence', 'contabo-daily.py')
spr = load('service_profile_for_daily', 'contabo-service-profile.py')
operator = load('service_operator_for_daily', 'contabo-service-operator.py')
NOW = dt.datetime(2026, 11, 3, 18, 0, tzinfo=dt.timezone.utc)
IMAGE = 'sha256:' + 'b' * 64
OPERATION = '123e4567-e89b-42d3-a456-426614174000'


def profile(**changes):
    value = {
        'version': 'alterward-service-profile-1', 'generation': 1, 'parentProfileSha256': '9' * 64,
        'sourceCommit': 'a' * 40, 'imageId': IMAGE, 'effectiveComposeSha256': 'c' * 64,
        'serverEnvSha256': 'd' * 64, 'pinnedImageSha256': 'e' * 64, 'schema': 40,
        'serviceAccessEnforcement': True,
        'activation': {'approvalSha256': '1' * 64, 'approvedAt': '2026-11-03T17:50:00.000Z',
                       'backupManifestSha256': '2' * 64, 'restoreProofSha256': '3' * 64},
        'restoredFrom': None}
    value.update(changes)
    return value


ENV = {name: {'SERVICE_ACCESS_ENFORCEMENT': 'true'} for name in ('api', 'worker', 'web')}
IMAGES = {name: IMAGE for name in ('api', 'worker', 'web')}


@unittest.skipIf(os.name != 'posix', 'POSIX permission and ownership checks')
class ServiceDailyEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.record, self.state = root / 'service-profile', root / 'service-operations'
        for patcher in (patch.object(daily, 'SERVICE_PROFILE_DIR', self.record),
                        patch.object(daily, 'SERVICE_OPERATION_DIR', self.state),
                        patch.object(daily, 'UID', os.geteuid())):
            patcher.start()
            self.addCleanup(patcher.stop)

    def activate(self):
        return spr.activate(self.record, profile(), now=NOW)

    def journal(self):
        self.state.mkdir(mode=0o700, exist_ok=True)
        return operator.Journal(self.state)

    def health(self, **kwargs):
        return daily.service_record_health(kwargs.get('env', ENV), kwargs.get('images', IMAGES),
                                           kwargs.get('now', NOW))

    # ---- backup catalog ---------------------------------------------------
    def test_catalog_is_empty_before_first_use(self):
        self.assertEqual(daily.service_config_paths(), [])

    def test_catalog_lists_exactly_the_record_and_the_journal_evidence(self):
        self.activate()
        journal = self.journal()
        journal.append('intent-persisted', OPERATION, NOW)
        operation = self.state / OPERATION
        operation.mkdir(mode=0o700)
        for name in ('intent.json', 'readback.json'):
            (operation / name).write_bytes(b'{}')
            (operation / name).chmod(0o600)
        names = {str(p.relative_to(self.record.parent)) for p in daily.service_config_paths()}
        self.assertEqual(names, {
            'service-profile/head.json', 'service-profile/journal.jsonl', 'service-profile/profiles/1.json',
            'service-operations/journal.jsonl', f'service-operations/{OPERATION}/intent.json',
            f'service-operations/{OPERATION}/readback.json'})

    def test_catalog_fails_closed_on_unknown_or_public_evidence(self):
        self.activate()
        extra = self.record / 'notes.txt'
        extra.write_bytes(b'x')
        with self.assertRaises(ValueError):
            daily.service_config_paths()
        extra.unlink()
        (self.record / 'journal.jsonl').chmod(0o644)
        with self.assertRaises(ValueError):
            daily.service_config_paths()
        (self.record / 'journal.jsonl').chmod(0o600)
        self.state.mkdir(mode=0o700)
        (self.state / 'surprise').mkdir(mode=0o700)
        with self.assertRaises(ValueError):
            daily.service_config_paths()

    # ---- monitor facts ----------------------------------------------------
    def test_verified_record_matches_what_the_operator_module_accepts(self):
        self.activate()
        self.assertEqual(spr.verify(self.record)['generation'], 1)
        self.assertEqual(self.health()['profile'], 'verified')

    def test_absent_record_is_reported_and_flagged_only_when_enforcement_is_on(self):
        value = self.health()
        self.assertEqual((value['profile'], value['journal'], value['unfinished']), ('absent', 'absent', False))
        self.assertIn('service_profile_missing', daily.service_alerts({'service': {**value, 'policy': None}}))
        legacy = self.health(env={n: {} for n in ENV})
        self.assertEqual(daily.service_alerts({'service': {**legacy, 'policy': None}}), [])

    def test_a_different_running_image_or_missing_enforcement_is_a_mismatch(self):
        self.activate()
        self.assertEqual(self.health(images={**IMAGES, 'worker': 'sha256:' + '0' * 64})['profile'], 'mismatch')
        self.assertEqual(self.health(env={n: {} for n in ENV})['profile'], 'mismatch')

    def test_tampered_record_is_unverified(self):
        self.activate()
        head = self.record / 'head.json'
        head.write_bytes(head.read_bytes().replace(b'"generation":1', b'"generation":2'))
        self.assertEqual(self.health()['profile'], 'unverified')

    def test_unfinished_operations_alert_after_the_grace_or_at_once_when_unknown(self):
        journal = self.journal()
        journal.append('intent-persisted', OPERATION, NOW)
        journal.append('apply-started', OPERATION, NOW)
        self.assertFalse(self.health(now=NOW + dt.timedelta(minutes=5))['unfinished'])
        self.assertTrue(self.health(now=NOW + dt.timedelta(minutes=31))['unfinished'])
        journal.append('apply-unknown', OPERATION, NOW)
        self.assertTrue(self.health(now=NOW)['unfinished'])
        journal.append('reconciled-committed', OPERATION, NOW)
        self.assertEqual((self.health(now=NOW + dt.timedelta(hours=3))['unfinished'],
                          self.health()['journal']), (False, 'verified'))
        other = '223e4567-e89b-42d3-a456-426614174000'
        journal.append('intent-persisted', other, NOW)
        journal.append('apply-started', other, NOW)
        journal.append('apply-unknown', other, NOW)
        self.assertTrue(self.health()['unfinished'])
        journal.append('drift-accepted', other, NOW)  # the owner-confirmed close ends the alert
        self.assertEqual((self.health()['unfinished'], self.health()['journal']), (False, 'verified'))

    def test_a_broken_operation_journal_is_unverified(self):
        journal = self.journal()
        journal.append('intent-persisted', OPERATION, NOW)
        journal.append('applied', OPERATION, NOW)
        path = self.state / 'journal.jsonl'
        path.write_bytes(path.read_bytes().replace(b'"sequence":2', b'"sequence":3'))
        self.assertEqual(self.health()['journal'], 'unverified')

    # ---- alerts -----------------------------------------------------------
    def test_service_alerts_cover_each_condition_and_stay_quiet_for_legacy_health(self):
        base = {'profile': 'verified', 'journal': 'verified', 'unfinished': False, 'enforced': True,
                'policy': {'mode': 'open', 'reconcileRequired': False, 'capacity': 10, 'used': 4}}
        self.assertEqual(daily.service_alerts({'service': base}), [])
        self.assertEqual(daily.service_alerts({}), [])
        cases = {
            'service_profile_mismatch': {'profile': 'mismatch'},
            'service_journal_unverified': {'journal': 'unverified'},
            'service_operation_unreconciled': {'unfinished': True},
            'service_policy_missing': {'policy': None},
            'service_reconcile_required': {'policy': {**base['policy'], 'reconcileRequired': True}},
            'service_wave_over_capacity': {'policy': {**base['policy'], 'used': 10}},
        }
        for alert, change in cases.items():
            with self.subTest(alert):
                self.assertEqual(daily.service_alerts({'service': {**base, **change}}), [alert])
        full_and_closed = {**base['policy'], 'mode': 'invitation', 'used': 10}
        self.assertEqual(daily.service_alerts({'service': {**base, 'policy': full_and_closed}}), [])

    def test_alerts_for_includes_the_service_alerts(self):
        health = {'ownerHealthy': True, 'databaseTlsVerified': True, 'pendingJobs': 0, 'anonymousDenied': 4,
                  'edgeClosed': True, 'diskFreeBytes': 10 * 1024**3, 'originCertificateOver30Days': True,
                  'lastBackupAt': NOW.isoformat(), 'backupFailed': False,
                  'service': {'profile': 'absent', 'journal': 'absent', 'unfinished': False,
                              'enforced': True, 'policy': None}}
        self.assertEqual(daily.alerts_for(health, NOW), ['service_profile_missing', 'service_policy_missing'])


if __name__ == '__main__':
    unittest.main()
