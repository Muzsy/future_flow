"""Plan 055: service operations on the new host (no Docker, no database)."""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('prod_service', ROOT / 'scripts/prod/service.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)
USER = '11111111-1111-4111-8111-111111111111'
POLICY = {'revision': 109, 'mode': 'open', 'generationEnabled': True, 'checkoutEnabled': True,
          'reconcileRequired': False, 'admissionCapacity': 53, 'admissionUsed': 3}


def observed(**accounts):
    return {'policy': dict(POLICY), 'accounts': [
        {'userId': USER, 'root': 'active', 'admission': {'revision': 4, 'state': 'active'}}] if accounts else []}


class FakeProbe:
    """Answers like the reviewed probe; `apply_fails` simulates a lost response."""

    def __init__(self, apply_fails=False, reconcile='committed'):
        self.calls, self.apply_fails, self.reconcile = [], apply_fails, reconcile

    def __call__(self, payload, timeout=240):
        self.calls.append(payload['mode'])
        if payload['mode'] == 'service-status':
            return observed(a=1) if payload['accounts'] else observed()
        if payload['mode'] == 'service-prepare':
            now = service.release.utcnow()
            after = dict(POLICY, generationEnabled=False, checkoutEnabled=False, revision=110)
            intent = {'observedAt': now.isoformat(), 'expiresAt': (now + dt.timedelta(minutes=15)).isoformat(),
                      'before': {'policy': POLICY, 'accounts': []}, 'after': {'policy': after, 'accounts': []},
                      'request': payload['request']}
            return {'intent': intent, 'intentSha256': 'a' * 64}
        if payload['mode'] == 'service-apply':
            if self.apply_fails:
                raise RuntimeError('lost')
            return {'applied': True}
        if payload['mode'] == 'service-reconcile':
            return {'outcome': self.reconcile}
        raise AssertionError(payload['mode'])


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        (root / 'releases').mkdir()
        (root / 'releases' / '20261123T120000Z.json').write_text(json.dumps(
            {'outcome': 'released', 'commit': 'c' * 40}))
        self.patches = [mock.patch.object(service, 'ROOT', root),
                        mock.patch.object(service, 'STATE', root / 'ops' / 'service'),
                        mock.patch.object(service, 'running_image', return_value='sha256:' + 'b' * 64)]
        for patch in self.patches:
            patch.start()

    def tearDown(self):
        for patch in self.patches:
            patch.stop()
        self.tmp.cleanup()

    def test_requests_for_every_operation(self):
        o = observed(a=1)
        self.assertEqual(service.build_request('pause', o),
                         {'kind': 'policy', 'expectedPolicyRevision': 109, 'generationEnabled': False,
                          'checkoutEnabled': False})
        self.assertTrue(service.build_request('resume', o)['generationEnabled'])
        self.assertEqual(service.build_request('wave-open', o, capacity=80)['capacity'], 80)
        self.assertEqual(service.build_request('wave-close', o),
                         {'kind': 'wave', 'expectedPolicyRevision': 109, 'capacity': 53, 'open': False})
        self.assertEqual(service.build_request('revoke', o, users=[USER])['members'],
                         [{'userId': USER, 'expectedRevision': 4, 'state': 'revoked'}])
        self.assertEqual(service.build_request('reconcile', o)['kind'], 'restore-reconcile')
        self.assertEqual(service.build_request('bootstrap', {'policy': None}), {'kind': 'bootstrap', 'members': []})
        with self.assertRaises(service.Refusal):
            service.build_request('bootstrap', o)
        for bad in (lambda: service.build_request('wave-open', o),
                    lambda: service.build_request('revoke', observed(), users=[USER]),
                    lambda: service.build_request('pause', {'policy': None})):
            with self.assertRaises(service.Refusal):
                bad()

    def test_plan_then_apply_persists_before_sql_and_chains_the_journal(self):
        fake = FakeProbe()
        with mock.patch.object(service, 'probe', fake):
            text, card = service.plan('pause')
            self.assertIn('After: open admission, capacity 53, paused', text)
            result = service.apply(card)
        self.assertEqual(result['outcome'], 'applied')
        self.assertEqual(fake.calls, ['service-status', 'service-prepare', 'service-apply', 'service-status'])
        events = [row['event'] for row in service.journal_rows()]
        self.assertEqual(events, ['intent-persisted', 'apply-started', 'applied'])
        with self.assertRaises(service.Refusal):  # the prepared card is used up
            service.apply(card)

    def test_a_lost_response_is_reconciled_never_repeated(self):
        fake = FakeProbe(apply_fails=True, reconcile='uncommitted')
        with mock.patch.object(service, 'probe', fake):
            _, card = service.plan('pause')
            result = service.apply(card)
        self.assertEqual(result['outcome'], 'reconciled-uncommitted')
        self.assertEqual(fake.calls.count('service-apply'), 1)
        self.assertEqual([r['event'] for r in service.journal_rows()][-2:], ['apply-unknown', 'reconciled-uncommitted'])

    def test_stale_or_expired_cards_and_a_broken_journal_are_refused(self):
        with mock.patch.object(service, 'probe', FakeProbe()):
            _, first = service.plan('pause')
            _, second = service.plan('resume')
            service.apply(first)
            with self.assertRaises(service.Refusal):  # prepared before another operation ran
                service.apply(second)
            _, third = service.plan('resume')
            later = service.release.utcnow() + dt.timedelta(minutes=16)
            with mock.patch.object(service.release, 'utcnow', return_value=later):
                with self.assertRaises(service.Refusal):
                    service.apply(third)
        path = service.STATE / 'journal.jsonl'
        rows = path.read_text().splitlines()
        tampered = json.loads(rows[0])
        tampered['operationId'] = 'x'
        path.write_text('\n'.join([json.dumps(tampered)] + rows[1:]) + '\n')
        with self.assertRaises(service.Refusal):
            service.journal_rows()

    def test_main_refuses_bad_arguments_before_any_probe(self):
        with mock.patch.object(service, 'probe') as probe, mock.patch('builtins.print'):
            self.assertEqual(service.main(['status', '--user', 'not-a-uuid']), 1)
            self.assertEqual(service.main(['plan', 'wave', '--open', '--close']), 1)
            self.assertEqual(service.main(['plan']), 1)
        probe.assert_not_called()


if __name__ == '__main__':
    unittest.main()
