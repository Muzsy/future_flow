import copy
import datetime as dt
import importlib.util
from pathlib import Path
import signal
import subprocess
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


for name, filename in [('alterward_backup', 'contabo-backup.py'),
    ('alterward_target', 'contabo-target.py'), ('alterward_owner', 'contabo-owner.py'),
    ('alterward_activation', 'contabo-owner-activation.py'), ('alterward_upgrade', 'contabo-owner-upgrade.py'),
    ('alterward_fence', 'contabo-writer-fence.py'), ('alterward_daily', 'contabo-daily.py'),
    ('alterward_personal_policy', 'contabo-personal-beta-policy.py'),
    ('alterward_readers', 'contabo-personal-beta-readers.py'),
    ('alterward_personal_observation', 'contabo-personal-beta-observation.py')]:
    load(name, filename)
beta = load('alterward_personal_beta', 'contabo-personal-beta.py')
policy = sys.modules['alterward_personal_policy']


class FundedTransitionTests(unittest.TestCase):
    def setUp(self):
        self.signals = {n: signal.getsignal(n) for n in beta.INTERRUPTION_SIGNALS}
        self.events = []
        self.runtime = self.files = 'readers'
        self.sticky = False

    def tearDown(self):
        for n, handler in self.signals.items():
            signal.signal(n, handler)

    def execute(self, failure=None, recovery_failure=None):
        def event(name):
            self.events.append(name)
            if name == failure or (name == recovery_failure and 'restore' in self.events):
                raise RuntimeError('synthetic failure')
        def stop():
            self.runtime = 'stopped'
            event('stop')
        def held():
            self.assertEqual(self.runtime, 'stopped')
            event('held')
        def expose():
            self.assertEqual(self.runtime, 'stopped')
            event('fresh-observation')
            event('sticky-intent')
            self.sticky = True
            event('promote')
            self.files = 'funded'
        def start():
            self.assertTrue(self.sticky)
            self.assertEqual(self.files, 'funded')
            event('start')
            self.runtime = 'funded'
        def restore():
            self.assertEqual(self.runtime, 'stopped')
            event('restore')
            self.runtime = self.files = 'owner-zero'
        beta.funded_transition(record=lambda state: event('record:' + state),
            stop=stop, held=held, expose=expose, start=start, verify=lambda: event('verify'),
            restore=restore, verify_zero=lambda: event('verify-zero'))

    def test_fresh_held_observation_and_sticky_intent_precede_promotion_and_start(self):
        self.execute()
        self.assertEqual(self.events, ['record:applying', 'stop', 'held', 'record:held',
            'fresh-observation', 'sticky-intent', 'promote', 'start', 'verify', 'record:applied'])
        self.assertEqual((self.runtime, self.files), ('funded', 'funded'))

    def test_initial_journal_failure_leaves_reader_runtime_untouched(self):
        with self.assertRaises(RuntimeError):
            self.execute('record:applying')
        self.assertEqual(self.runtime, 'readers')
        self.assertEqual(self.events, ['record:applying'])

    def test_every_transition_fault_stops_and_restores_original_owner_zero(self):
        for failure in ['held', 'record:held', 'fresh-observation', 'sticky-intent',
                        'promote', 'start', 'verify', 'record:applied']:
            with self.subTest(failure=failure):
                self.events, self.runtime, self.files, self.sticky = [], 'readers', 'readers', False
                with self.assertRaises(RuntimeError):
                    self.execute(failure)
                self.assertEqual((self.runtime, self.files), ('owner-zero', 'owner-zero'))
                self.assertEqual(self.events[-1], 'record:disabled-after-failure')
                if failure in ['start', 'verify', 'record:applied']:
                    self.assertTrue(self.sticky)

    def test_failed_zero_recovery_stops_again_and_records_manual_recovery(self):
        with self.assertRaises(RuntimeError):
            self.execute('verify', 'restore')
        self.assertEqual(self.runtime, 'stopped')
        self.assertEqual(self.events[-2:], ['stop', 'record:recovery-required'])

    def test_either_durable_transition_or_exposure_bars_another_window(self):
        for existence in [[True], [False, True]]:
            with patch.object(Path, 'exists', side_effect=existence), patch.object(Path, 'is_symlink', return_value=False):
                with self.assertRaises(ValueError):
                    beta.require_unattempted()

    def test_disable_does_not_read_candidate_provider_or_prepared_proof(self):
        with patch.object(beta.readers, 'disable', return_value={'zeroBaselineRestored': True}) as stop_zero, \
             patch.object(Path, 'exists', return_value=False), \
             patch.object(Path, 'is_symlink', return_value=False), \
             patch.object(beta, 'preparation', side_effect=AssertionError('candidate read forbidden')):
            result = beta.disable({'onlyOriginalZeroInputs': True})
            self.assertTrue(result['zeroBaselineRestored'])
            self.assertEqual(result['operationPaidAiCalls'], 0)
            self.assertTrue(result['historicalProviderUsageNotMeasured'])
            self.assertEqual(result['paidAiCallsScope'], 'this-configuration-operation')
            stop_zero.assert_called_once_with({'onlyOriginalZeroInputs': True})

    def test_disable_marks_prior_provider_exposure_without_claiming_usage_is_zero(self):
        with patch.object(beta.readers, 'disable', return_value={'zeroBaselineRestored': True}), \
             patch.object(Path, 'exists', autospec=True, side_effect=lambda p: p.name in {'personal-beta', 'journal.json'}), \
             patch.object(Path, 'is_symlink', return_value=False), \
             patch.object(beta.readers, 'update_durable') as record:
            result = beta.disable({'onlyOriginalZeroInputs': True})
            self.assertTrue(result['priorFundedJournalPresent'])
            self.assertTrue(result['providerKeyRevocationRequired'])
            self.assertTrue(result['historicalProviderUsageNotMeasured'])
            self.assertEqual(result['paidAiCallsScope'], 'this-configuration-operation')
            record.assert_called_once()

    def test_emergency_module_import_needs_no_daily_observer_policy_or_fixture(self):
        # Fresh interpreter models the actual reduced SSH bundle; it never calls
        # an actuator or uses the installed server filesystem.
        code = '''import importlib.util,sys
from pathlib import Path
sys.dont_write_bytecode=True
root=Path(sys.argv[1])/'scripts/ops'
for name,file in [('alterward_backup','contabo-backup.py'),('alterward_target','contabo-target.py'),
 ('alterward_owner','contabo-owner.py'),('alterward_activation','contabo-owner-activation.py'),
 ('alterward_upgrade','contabo-owner-upgrade.py'),('alterward_fence','contabo-writer-fence.py'),
 ('alterward_readers','contabo-personal-beta-readers.py'),('alterward_personal_beta','contabo-personal-beta.py')]:
 spec=importlib.util.spec_from_file_location(name,root/file)
 module=importlib.util.module_from_spec(spec);sys.modules[name]=module;spec.loader.exec_module(module)
assert all(name not in sys.modules for name in ['alterward_daily','alterward_personal_policy',
 'alterward_personal_observation','alterward_readers_fixture','alterward_personal_fixture'])
'''
        result = subprocess.run([sys.executable, '-B', '-c', code, str(ROOT)],
            capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)


class PersonalEnvironmentTests(unittest.TestCase):
    def setUp(self):
        self.before = {key: '' for key in beta.ENV_KEYS}
        self.before.update(UNRELATED_SECRET='synthetic_keep_unchanged', OPENAI_API_KEY=policy.SENTINEL,
                           CLOSED_SITE_ALLOWED_EMAILS='owner@example.invalid,tester@example.invalid')
        self.values = dict(self.before, OPENAI_API_KEY='synthetic_unused_provider',
                       CLOSED_BETA_USER_IDS='11111111-1111-4111-8111-111111111111',
                       AI_PROJECT_BUDGET_USD='2', AI_USER_BUDGET_USD='0.5',
                       AI_BUDGET_WINDOW_START='2026-10-11T12:10:00Z', AI_BUDGET_WINDOW_END='2026-11-10T12:10:00Z')
        for flag in policy.PAID_FLAGS:
            self.values[flag] = 'true'
        self.text = ''.join(key + "='" + value + "'\n" for key, value in self.before.items())
        self.config = {'services': {'worker': {'environment': self.values}}}

    def test_only_exact_existing_whitelist_lines_change_and_origin_is_unchanged(self):
        result = beta.server_environment(beta.candidate_environment(self.text, self.config).decode())
        self.assertEqual(result, self.values)
        self.assertEqual(result['UNRELATED_SECRET'], self.before['UNRELATED_SECRET'])
        self.assertEqual(result['CLOSED_SITE_ALLOWED_EMAILS'], self.before['CLOSED_SITE_ALLOWED_EMAILS'])

    def test_missing_duplicate_and_unsafe_literal_inputs_are_refused(self):
        for text in [self.text.replace("AI_USER_BUDGET_USD=''\n", ''), self.text + "AI_USER_BUDGET_USD=''\n"]:
            with self.assertRaises(ValueError):
                beta.candidate_environment(text, self.config)
        for value in ["$(unsafe)", "bad'quote", 'bad\nline', '${EXPANSION}']:
            config = copy.deepcopy(self.config)
            config['services']['worker']['environment']['OPENAI_API_KEY'] = value
            with self.assertRaises(ValueError):
                beta.candidate_environment(self.text, config)

    def test_future_window_must_leave_time_to_verify_before_spending(self):
        now = dt.datetime(2026, 10, 11, 12, tzinfo=dt.timezone.utc)
        terms = {'startsAt': '2026-10-11T12:05:00Z'}
        beta.require_future_start(policy, terms, now, 300)
        with self.assertRaises(ValueError):
            beta.require_future_start(policy, terms, now + dt.timedelta(seconds=1), 300)


class RestoredPreparationTests(unittest.TestCase):
    def setUp(self):
        self.installed = {'sourceCommit': 'a' * 40, 'scriptHashes': {}, 'unitHashes': {}}
        self.path = Path('/root/synthetic/prepared.json')
        self.data = b'synthetic exact durable preparation'
        self.prepared_at = dt.datetime(2026, 10, 11, 12, tzinfo=dt.timezone.utc)
        self.manifest = {**self.installed, 'runId': 'synthetic-run', 'capturedAt': '2026-10-11T12:01:00+00:00',
            'encryptedFiles': {'config.tar.age': {'sha256': 'b' * 64}},
            'configFiles': {str(self.path).lstrip('/'): beta.sha(self.data)}, 'expectedTables': [{'count': 3}]}
        self.proof = {**self.installed, 'runId': 'synthetic-run', 'encryptedFiles': self.manifest['encryptedFiles'],
            'capturedAt': '2026-10-11T12:02:00+00:00', 'liveDatabaseWrites': False, 'paidAiCalls': 0,
            'configFilesRestored': 1, 'tablesRestoredAndDataMatched': 1, 'rowsMatched': 3}
        for field in ['offsiteCiphertextVerified', 'tamperedCiphertextRejected', 'proxyAdaptAndValidate',
                      'singleTransactionRestore', 'temporaryContainersRemoved', 'temporaryPlaintextRemoved',
                      'allExistingContainersUnchanged', 'decryptionIdentityMemoryOnly']:
            self.proof[field] = True

    def check(self, proof=None, manifest=None, current=True):
        daily = types.SimpleNamespace(ROOT=Path('/root/synthetic'),
            config=lambda: self.installed, regular=lambda p: beta.encoded(proof or self.proof),
            current_proof=lambda p,v,age: current, source_binding=lambda p: self.installed,
            completed_archives=lambda p: [{'manifest': manifest or self.manifest}],
            reader_config_paths=lambda: [self.path], personal_config_paths=lambda: [])
        with patch.object(beta.fence, 'original', return_value=self.data):
            return beta.require_restored_preparation(daily, self.prepared_at)

    def test_only_a_current_real_restore_bound_to_exact_candidate_bytes_passes(self):
        self.assertEqual(self.check(), 'synthetic-run')

    def test_old_incomplete_or_mismatched_restore_does_not_authorize_promotion(self):
        with self.assertRaises(ValueError):
            self.check(current=False)
        for patch_value in [{'temporaryPlaintextRemoved': False}, {'rowsMatched': 2},
                            {'configFilesRestored': 0}, {'runId': 'other'}, {'liveDatabaseWrites': True}]:
            with self.subTest(patch=patch_value), self.assertRaises(ValueError):
                self.check(proof={**self.proof, **patch_value})
        for patch_value in [{'configFiles': {}}, {'sourceCommit': 'c' * 40},
                            {'capturedAt': '2026-10-11T11:59:00+00:00'}]:
            with self.subTest(patch=patch_value), self.assertRaises(ValueError):
                self.check(manifest={**self.manifest, **patch_value})


if __name__ == '__main__':
    unittest.main()
