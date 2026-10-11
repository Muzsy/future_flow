import importlib.util
import json
from pathlib import Path
import signal
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
load('alterward_target', 'contabo-target.py')
load('alterward_owner', 'contabo-owner.py')
load('alterward_activation', 'contabo-owner-activation.py')
load('alterward_upgrade', 'contabo-owner-upgrade.py')
load('alterward_fence', 'contabo-writer-fence.py')
readers = load('alterward_readers', 'contabo-personal-beta-readers.py')


class ReaderTransactionTests(unittest.TestCase):
    def setUp(self):
        self.handlers = {n: signal.getsignal(n) for n in readers.INTERRUPTION_SIGNALS}
        self.events = []
        self.runtime = 'owner'
        self.files = 'owner'

    def tearDown(self):
        for number, handler in self.handlers.items():
            signal.signal(number, handler)

    def run_transition(self, fail=None, recovery_failure=None):
        def event(name):
            self.events.append(name)
            if name == fail or (name == recovery_failure and 'restore' in self.events):
                raise RuntimeError('synthetic transition failure')
        def stop():
            event('stop')
            self.runtime = 'stopped'
        def held():
            self.assertEqual(self.runtime, 'stopped')
            event('held-check')
        def start():
            event('start')
            self.runtime = 'readers'
        def promote():
            event('promote')
            self.files = 'readers'
        def restore():
            event('restore')
            self.runtime = self.files = 'owner'
        def verify_zero():
            event('verify-zero')
            self.assertEqual((self.runtime, self.files), ('owner', 'owner'))
        readers.transition(record=lambda name: event('journal:' + name), stop=stop,
                           held=held, start=start, verify=lambda: event('verify'),
                           promote=promote, restore=restore, verify_zero=verify_zero)

    def test_success_records_intent_hold_verification_then_promotion(self):
        self.run_transition()
        self.assertEqual(self.events, ['journal:applying', 'stop', 'held-check',
                         'journal:held', 'start', 'verify', 'journal:candidate-verified',
                         'promote', 'journal:applied'])
        self.assertEqual((self.runtime, self.files), ('readers', 'readers'))

    def test_python_and_js_share_one_pinned_canonical_manifest_byte_contract(self):
        fixture = json.loads((ROOT / 'tests/ops/fixtures/recovery-manifest.json').read_text())
        self.assertEqual(readers.sha(readers.encoded(fixture['manifest'])), fixture['expectedCanonicalSha256'])

    def test_unrecorded_intent_cannot_stop_or_start_services(self):
        with self.assertRaises(RuntimeError):
            self.run_transition('journal:applying')
        self.assertEqual(self.events, ['journal:applying'])
        self.assertEqual((self.runtime, self.files), ('owner', 'owner'))

    def test_every_post_stop_failure_restores_the_original_zero_state(self):
        for failure in ['held-check', 'journal:held', 'start', 'verify',
                        'journal:candidate-verified', 'promote', 'journal:applied']:
            with self.subTest(failure=failure):
                self.events = []
                self.runtime = self.files = 'owner'
                with self.assertRaises(RuntimeError):
                    self.run_transition(failure)
                self.assertEqual((self.runtime, self.files), ('owner', 'owner'))
                self.assertEqual(self.events[-1], 'journal:disabled-after-failure')
                self.assertLess(self.events.index('stop'), self.events.index('restore'))

    def test_failed_recovery_verification_stops_again_and_records_attention(self):
        with self.assertRaises(RuntimeError):
            self.run_transition('verify', 'verify-zero')
        self.assertEqual(self.runtime, 'stopped')
        self.assertEqual(self.events[-1], 'journal:recovery-required')
        self.assertEqual(self.events.count('stop'), 3)

    def test_email_line_replacement_preserves_every_other_literal_byte(self):
        original = "DATABASE_URL='postgresql://fixture/$literal'\nCLOSED_SITE_ALLOWED_EMAILS='owner@example.invalid'\nOPENAI_API_KEY='alterward_owner_provider_access_disabled'\n"
        output = readers.reader_environment(original, ['owner@example.invalid', 'tester@example.invalid'])
        self.assertEqual(output.decode(), original.replace("'owner@example.invalid'", "'owner@example.invalid,tester@example.invalid'"))
        for text in [original.replace('CLOSED_SITE_ALLOWED_EMAILS', 'OTHER'), original + original]:
            with self.assertRaises(ValueError):
                readers.reader_environment(text, ['tester@example.invalid'])
        with self.assertRaises(ValueError):
            readers.reader_environment(original, ['tester@example.invalid\nOTHER=changed'])

    def test_disable_never_reads_or_validates_the_current_candidate(self):
        events = []
        with patch.object(readers.upgrade, 'foreign_state', return_value={}), \
             patch.object(readers, 'stop_project', side_effect=lambda: events.append('stop')), \
             patch.object(readers, 'restore_zero', side_effect=lambda req: events.append('restore')), \
             patch.object(readers, 'verify_zero', side_effect=lambda req, other: {'paidAiCalls': 0}), \
             patch.object(readers.upgrade, 'atomic_private'):
            result = readers.disable({'ownerAccess': 'original receipt only'})
        self.assertEqual(events, ['stop', 'restore'])
        self.assertTrue(result['zeroBaselineRestored'])
        self.assertTrue(result['requiresExternalAccessReview'])

    def test_disable_keeps_project_stopped_if_original_validation_fails(self):
        events = []
        with patch.object(readers.upgrade, 'foreign_state', return_value={}), \
             patch.object(readers, 'stop_project', side_effect=lambda: events.append('stop')), \
             patch.object(readers, 'restore_zero', side_effect=ValueError('bad baseline')):
            with self.assertRaises(ValueError):
                readers.disable({})
        self.assertEqual(events, ['stop', 'stop'])

    def test_missing_foreign_inspection_does_not_prevent_emergency_stop(self):
        events = []
        with patch.object(readers.upgrade, 'foreign_state', side_effect=RuntimeError('unavailable')), \
             patch.object(readers, 'stop_project', side_effect=lambda: events.append('stop')), \
             patch.object(readers, 'restore_zero') as restore:
            with self.assertRaises(ValueError):
                readers.disable({})
        self.assertEqual(events, ['stop', 'stop'])
        restore.assert_not_called()

    def test_one_stop_failure_still_attempts_all_three_but_cannot_start_candidate(self):
        values = [{'Id': role, 'Config': {'Labels': {'com.docker.compose.project': readers.PROJECT,
                   'com.docker.compose.service': role}}, 'State': {'Running': True}}
                  for role in ['web', 'api', 'worker']]
        stopped = [{**item, 'State': {'Running': False}} for item in values]
        calls = []
        def docker(*args):
            if args[0] == 'inspect':
                return type('Result', (), {'stdout': json.dumps(stopped if calls else values).encode()})()
            calls.append(args[-1])
            if args[-1] == 'web':
                raise RuntimeError('synthetic first stop failure')
        with patch.object(readers, 'project_ids', return_value=['web', 'api', 'worker']), \
             patch.object(readers, 'docker', side_effect=docker):
            with self.assertRaises(ValueError):
                readers.stop_project()
        self.assertEqual(calls, ['web', 'api', 'worker'])


if __name__ == '__main__':
    unittest.main()
