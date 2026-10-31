"""Fault boundaries: uncertain commit never reseeds or reopens old allowance."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'successor_transition', Path(__file__).resolve().parents[2] /
    'scripts/ops/beta-successor-transition.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Adapter:
    def __init__(self, *, fail=None, commit='uncommitted', stop_fails=False):
        self.events = []
        self.fail = fail
        self.commit = commit
        self.stop_fails = stop_fails
        self.held = False
        self.sql_applications = 0
        self.old_limit = 500000

    def event(self, name):
        self.events.append(name)
        if self.fail == name:
            raise InterruptedError(name)

    def preflight(self, candidate, *, recovery):
        self.event('preflight-recovery' if recovery else 'preflight')

    def record(self, name, candidate):
        self.event(name)

    def begin_guard(self, candidate):
        self.event('watch-start')

    def finish_guard(self):
        self.event('watch-finish')

    def restore_restart_policy(self):
        self.event('restart-restored')

    def stop_and_hold(self, candidate):
        self.event('stop')
        if self.stop_fails and self.sql_applications:
            raise OSError('stop failed')
        self.held = True

    def verify_drained(self, candidate):
        self.event('drain')

    def require_candidate_restore(self, candidate):
        self.event('candidate-restore')

    def apply_accounts(self, candidate):
        self.sql_applications += 1
        self.old_limit = 0
        self.commit = 'committed'
        # A lost output occurs AFTER durable commit, not before it.
        self.event('apply-accounts')

    def reconcile_accounts(self, candidate):
        self.event('reconcile')
        return {'state': self.commit}

    def stage_authority(self, candidate):
        self.event('stage')

    def verify_staged(self, candidate):
        self.event('verify-staged')

    def require_future_start(self, candidate):
        self.event('future-start')

    def expose(self, candidate):
        self.held = False
        self.event('expose')

    def verify_serving(self, candidate):
        self.event('verify-serving')


class SuccessorTransitionTests(unittest.TestCase):
    def test_verified_host_sequence_never_claims_a_browser_pass(self):
        a = Adapter()
        result = module.transition(a, {})
        self.assertTrue(result['accountsCommitted'])
        self.assertFalse(result['browserJourneyPassed'])
        self.assertEqual(a.sql_applications, 1)
        self.assertLess(a.events.index('candidate-restore'), a.events.index('apply-accounts'))
        self.assertLess(a.events.index('reconcile'), a.events.index('stage'))
        self.assertLess(a.events.index('verify-staged'), a.events.index('expose'))
        self.assertLess(a.events.index('future-start'), a.events.index('expose'))
        self.assertEqual(a.events[-3:], ['applied','restart-restored','watch-finish'])

    def test_invalid_preflight_does_not_mutate_or_stop(self):
        a = Adapter(fail='preflight')
        with self.assertRaises(InterruptedError):
            module.transition(a, {})
        self.assertEqual(a.events, ['preflight'])
        self.assertEqual(a.old_limit, 500000)

    def test_each_failure_stays_held_and_never_reopens_committed_allowance(self):
        for boundary in ['drain', 'candidate-restore', 'database-intent',
                         'apply-accounts', 'reconcile', 'accounts-committed',
                         'stage', 'verify-staged', 'authority-staged',
                         'future-start', 'exposure-intent', 'expose',
                         'verify-serving', 'applied', 'restart-restored']:
            with self.subTest(boundary=boundary):
                a = Adapter(fail=boundary)
                with self.assertRaises(InterruptedError):
                    module.transition(a, {})
                self.assertTrue(a.held)
                self.assertEqual(a.events[-3:], ['held-after-failure','closed','watch-finish'])
                if a.sql_applications:
                    self.assertEqual(a.old_limit, 0)
                else:
                    self.assertNotIn('stage', a.events)

    def test_explicit_lost_commit_recovery_never_repeats_sql(self):
        a = Adapter(fail='apply-accounts')
        with self.assertRaises(InterruptedError):
            module.transition(a, {})
        a.fail = None
        module.transition(a, {}, recovery=True)
        self.assertEqual(a.sql_applications, 1)
        self.assertEqual(a.old_limit, 0)
        self.assertEqual(a.events[-3:], ['recovered','restart-restored','watch-finish'])

    def test_uncommitted_or_mixed_recovery_cannot_seed_or_expose(self):
        for state in ['uncommitted', 'mixed', 'used', None]:
            a = Adapter(commit=state)
            with self.assertRaises(ValueError):
                module.transition(a, {}, recovery=True)
            self.assertEqual(a.sql_applications, 0)
            self.assertNotIn('stage', a.events)
            self.assertNotIn('expose', a.events)
            self.assertTrue(a.held)

    def test_cleanup_error_cannot_replace_original_or_claim_hold(self):
        a = Adapter(fail='apply-accounts', stop_fails=True)
        with self.assertRaises(InterruptedError) as result:
            module.transition(a, {})
        self.assertIsInstance(result.exception.__cause__, OSError)
        self.assertEqual(a.events[-1], 'stop-unverified')
        self.assertNotIn('held-after-failure', a.events)


class IdempotentDatabaseAdapter(Adapter):
    """A schema migration: one transaction that either committed or did not."""

    def database_pending(self, candidate):
        return self.commit == 'uncommitted'


class IdempotentDatabaseTransitionTests(unittest.TestCase):
    def test_recovery_finishes_an_uncommitted_idempotent_database_step(self):
        a = IdempotentDatabaseAdapter(fail='database-intent')
        with self.assertRaises(InterruptedError):
            module.transition(a, {})
        self.assertEqual((a.sql_applications, a.commit), (0, 'uncommitted'))
        a.fail = None
        module.transition(a, {}, recovery=True)
        self.assertEqual(a.sql_applications, 1)
        self.assertLess(a.events.index('candidate-restore', a.events.index('preflight-recovery')),
                        a.events.index('apply-accounts'))
        self.assertEqual(a.events[-3:], ['recovered', 'restart-restored', 'watch-finish'])
        # The attempt that is replayed records its intent first, in order.
        tail = a.events[a.events.index('recovery-intent'):]
        self.assertLess(tail.index('database-intent'), tail.index('apply-accounts'))

    def test_recovery_after_a_committed_step_never_repeats_it(self):
        a = IdempotentDatabaseAdapter(fail='apply-accounts')
        with self.assertRaises(InterruptedError):
            module.transition(a, {})
        a.fail = None
        module.transition(a, {}, recovery=True)
        self.assertEqual(a.sql_applications, 1)
        self.assertEqual(a.events[a.events.index('recovery-intent'):].count('database-intent'), 0)

    def test_an_adapter_without_the_hook_or_with_a_non_boolean_answer_never_replays(self):
        class Loose(Adapter):
            def database_pending(self, candidate):
                return 'yes'
        a = Loose(commit='uncommitted')
        with self.assertRaises(ValueError):
            module.transition(a, {}, recovery=True)
        self.assertEqual(a.sql_applications, 0)


if __name__ == '__main__':
    unittest.main()
