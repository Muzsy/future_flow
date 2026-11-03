"""Service operator protocol: fake runtime and probe, no Docker, DB or host mutation."""
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import tempfile
import unittest
import uuid

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('service_operator', directory / 'contabo-service-operator.py')
op = importlib.util.module_from_spec(spec)
spec.loader.exec_module(op)
spr = op._load('service_profile_for_test', 'contabo-service-profile.py')
NOW = dt.datetime(2026, 11, 3, 18, 0, tzinfo=dt.timezone.utc)
IMAGE = 'sha256:' + 'b' * 64
USER = str(uuid.uuid4())


def profile(generation=1, parent='9' * 64, **changes):
    value = {
        'version': 'alterward-service-profile-1', 'generation': generation,
        'parentProfileSha256': parent, 'sourceCommit': 'a' * 40, 'imageId': IMAGE,
        'effectiveComposeSha256': 'c' * 64, 'serverEnvSha256': 'd' * 64, 'pinnedImageSha256': 'e' * 64,
        'schema': 40, 'serviceAccessEnforcement': True,
        'activation': {'approvalSha256': '1' * 64, 'approvedAt': '2026-11-03T17:50:00.000Z',
                       'backupManifestSha256': '2' * 64, 'restoreProofSha256': '3' * 64},
        'restoredFrom': None}
    value.update(changes)
    return value


class FakeRuntime:
    """Stands in for the host adapter and for the TS probe's DB semantics."""

    def __init__(self):
        self.observed = {'images': {s: IMAGE for s in op.SERVICES}, 'effectiveComposeSha256': 'c' * 64,
                         'serverEnvSha256': 'd' * 64, 'pinnedImageSha256': 'e' * 64,
                         'serviceAccessEnforcement': True}
        self.policy = {'revision': 1, 'mode': 'invitation', 'generationEnabled': False,
                       'checkoutEnabled': False, 'reconcileRequired': False,
                       'admissionCapacity': 0, 'admissionUsed': 0}
        self.admissions = {}
        self.calls = []
        self.lose_apply = False      # SQL commits but the response is lost
        self.drift = False           # the state moved on: reconcile can prove neither side
        self.transient = False       # reconcile fails for a transient reason (not drift)
        self.bad_receipt = None      # apply returns this instead of a commit receipt
        self.probe_containers = False
        self.fail_before_sql = False  # apply dies before the transaction commits
        self.on_apply = None
        self.applied = set()

    def probes_running(self):
        return self.probe_containers

    def observe(self):
        self.calls.append('observe')
        return copy.deepcopy(self.observed)

    def probe(self, image_id, data, directory):
        mode = data['mode']
        self.calls.append((mode, image_id))
        if mode == 'service-status':
            return {'version': 'alterward-service-status-1', 'schema': 40, 'migrationPrefixSha256': 'f' * 64,
                    'policy': copy.deepcopy(self.policy) if self.policy else None,
                    'accounts': [{'userId': u, 'admission': self.admissions.get(u)} for u in data['accounts']],
                    'paidAiCalls': 0, 'authProviderWrites': False}
        if mode == 'service-prepare':
            intent = {'version': 'alterward-service-operation-intent-1', 'context': data['context'],
                      'request': data['request'], 'before': copy.deepcopy(self.policy),
                      'expiresAt': (NOW + dt.timedelta(seconds=900)).isoformat().replace('+00:00', 'Z')}
            return {'intent': intent, 'intentSha256': hashlib.sha256(op.canonical(intent)).hexdigest()}
        intent = data['intent']
        key = intent['context']['operationId']
        if mode == 'service-apply':
            if self.on_apply:
                self.on_apply(data)
            if self.fail_before_sql:
                raise RuntimeError('probe died')
            self.applied.add(key)
            request = intent['request']
            if request['kind'] == 'policy':
                self.policy.update(generationEnabled=request['generationEnabled'],
                                   checkoutEnabled=request['checkoutEnabled'])
            elif request['kind'] == 'wave':
                self.policy.update(admissionCapacity=request['capacity'],
                                   mode='open' if request['open'] else 'invitation')
            elif request['kind'] == 'restore-reconcile':
                self.policy.update(reconcileRequired=False, mode='invitation', generationEnabled=False,
                                   checkoutEnabled=False)
            elif request['kind'] == 'admission':
                for member in request['members']:
                    self.admissions[member['userId']] = {'revision': member['expectedRevision'] + 1,
                                                         'state': member['state']}
            elif request['kind'] == 'bootstrap':
                self.policy = {'revision': 1, 'mode': 'invitation', 'generationEnabled': False,
                               'checkoutEnabled': False, 'reconcileRequired': False,
                               'admissionCapacity': 0, 'admissionUsed': 0}
            if self.policy:
                self.policy['revision'] += 1
            if self.lose_apply:
                raise RuntimeError('response lost after commit')
            if self.bad_receipt is not None:
                return self.bad_receipt
            return {'outcome': 'committed', 'authProviderWrites': False, 'paidAiCalls': 0}
        if mode == 'service-reconcile':
            if self.transient:
                raise RuntimeError('probe container timed out')
            if self.drift:
                return {'outcome': 'drift'}
            return {'outcome': 'committed' if key in self.applied else 'uncommitted'}
        raise AssertionError(mode)


@unittest.skipIf(os.name != 'posix', 'POSIX permission, ownership and lock checks')
class OperatorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        base = Path(self.temporary.name)
        self.profile_dir = base / 'service-profile'
        self.state = base / 'service-operations'
        self.state.mkdir(mode=0o700)
        self.runtime = FakeRuntime()
        spr.activate(self.profile_dir, profile(), now=NOW)
        self.tick = 0

    def clock(self):
        self.tick += 1
        return NOW + dt.timedelta(seconds=self.tick)

    def operator(self):
        return op.Operator(profile_dir=self.profile_dir, state_dir=self.state, runtime=self.runtime,
                           clock=self.clock, identity=lambda: ('operator', 'host'))

    def rows(self):
        return op.Journal(self.state).rows()

    def applies(self):
        return [c for c in self.runtime.calls if c[0] == 'service-apply']

    # ---- happy path and protocol ------------------------------------------
    def test_pause_persists_the_intent_before_sql_and_chains_the_journal(self):
        seen = {}

        def at_apply(data):
            rows = self.rows()
            seen['events'] = [r['event'] for r in rows]
            seen['intent'] = (self.state / data['context']['operationId'] / 'intent.json').read_bytes()
        self.runtime.on_apply = at_apply
        result = self.operator().execute('pause', argv=['pause'])
        self.assertEqual(result['outcome'], 'committed')
        self.assertFalse(result['unverifiedAuthority'])
        self.assertEqual(seen['events'], ['intent-persisted', 'apply-started'])
        self.assertEqual([r['event'] for r in self.rows()], ['intent-persisted', 'apply-started', 'applied'])
        persisted = self.rows()[0]
        self.assertEqual(persisted['intentFileSha256'], hashlib.sha256(seen['intent']).hexdigest())
        self.assertEqual(persisted['profileGeneration'], 1)
        self.assertFalse(persisted['unverifiedAuthority'])
        directory = self.state / result['operationId']
        for name in ('intent.json', 'readback.json'):
            self.assertEqual(stat.S_IMODE((directory / name).stat().st_mode), 0o600)
        self.assertEqual(self.runtime.policy['generationEnabled'], False)

    def test_context_binds_profile_authority_operator_and_parent(self):
        operator = self.operator()
        record = spr.verify(self.profile_dir)
        first = operator.execute('resume', argv=['resume'])
        intent = json.loads((self.state / first['operationId'] / 'intent.json').read_bytes())
        context = intent['context']
        self.assertEqual(context['sourceCommit'], 'a' * 40)
        self.assertEqual(context['imageId'], IMAGE)
        self.assertEqual(context['authoritySha256'], op.authority_sha(record['profileSha256'], record['profile']))
        self.assertEqual(context['parentOperationSha256'], context['authoritySha256'])  # genesis
        self.assertEqual(context['operatorSha256'],
                         op.sha(op.canonical({'user': 'operator', 'host': 'host', 'argv': ['resume']})))
        head = op.Journal(self.state).head()
        second = operator.execute('pause', argv=['pause'])
        second_intent = json.loads((self.state / second['operationId'] / 'intent.json').read_bytes())
        self.assertEqual(second_intent['context']['parentOperationSha256'], head)
        self.assertNotEqual(first['operationId'], second['operationId'])

    def test_every_probe_runs_the_profile_image_and_never_a_foreign_one(self):
        self.operator().execute('resume')
        images = {c[1] for c in self.runtime.calls if isinstance(c, tuple)}
        self.assertEqual(images, {IMAGE})

    # ---- authority --------------------------------------------------------
    def test_a_missing_or_broken_profile_refuses_everything_that_is_not_an_emergency_stop(self):
        (self.profile_dir / 'head.json').unlink()
        operator = self.operator()
        for command, args in [('pause', {}), ('resume', {}), ('bootstrap', {}), ('restore-reconcile', {}),
                              ('wave-open', {'capacity': 10, 'approve_added': 10}), ('wave-close', {}),
                              ('revoke', {'user': USER})]:
            with self.subTest(command), self.assertRaisesRegex(op.Refusal, 'profile not verified'):
                operator.execute(command, args)
        self.assertEqual(self.applies(), [])
        self.assertEqual(self.rows(), [])
        status = operator.status()
        self.assertFalse(status['serviceProfile']['verified'])
        self.assertIsNone(status['database'])

    def test_a_running_service_that_differs_from_the_profile_is_refused(self):
        operator = self.operator()
        for change in [lambda o: o['images'].update(api='sha256:' + '0' * 64),
                       lambda o: o['images'].update(worker='sha256:' + '0' * 64),
                       lambda o: o['images'].update(web='sha256:' + '0' * 64),
                       lambda o: o.update(effectiveComposeSha256='0' * 64),
                       lambda o: o.update(serverEnvSha256='0' * 64),
                       lambda o: o.update(pinnedImageSha256='0' * 64),
                       lambda o: o.update(serviceAccessEnforcement=False),
                       lambda o: o['images'].pop('web')]:
            self.runtime.observed = FakeRuntime().observed
            change(self.runtime.observed)
            with self.subTest(), self.assertRaises(op.Refusal):
                operator.execute('pause')
        self.assertEqual(self.applies(), [])

    def test_a_non_active_profile_chain_state_is_never_extended_by_the_operator(self):
        # The operator only reads: the record is byte-identical after use.
        before = {p: p.read_bytes() for p in self.profile_dir.rglob('*') if p.is_file()}
        self.operator().execute('pause')
        self.assertEqual({p: p.read_bytes() for p in self.profile_dir.rglob('*') if p.is_file()}, before)

    # ---- emergency exception ---------------------------------------------
    def test_emergency_stops_run_without_a_profile_but_are_marked_unverified(self):
        (self.profile_dir / 'journal.jsonl').unlink()
        self.runtime.policy.update(mode='open', generationEnabled=True, checkoutEnabled=True,
                                   admissionCapacity=10)
        operator = self.operator()
        result = operator.execute('pause', emergency=True)
        self.assertTrue(result['unverifiedAuthority'])
        self.assertEqual(self.runtime.policy['generationEnabled'], False)
        closed = operator.execute('wave-close', emergency=True)
        self.assertTrue(closed['unverifiedAuthority'])
        self.assertEqual(self.runtime.policy['mode'], 'invitation')
        self.assertEqual(self.runtime.policy['admissionCapacity'], 10)  # a close never changes capacity
        intent = json.loads((self.state / closed['operationId'] / 'intent.json').read_bytes())
        self.assertEqual(intent['context']['sourceCommit'], '0' * 40)
        self.assertEqual(intent['context']['authoritySha256'], op.unverified_authority_sha(IMAGE))
        self.assertTrue(all(r.get('unverifiedAuthority') for r in self.rows() if r['event'] == 'intent-persisted'))

    def test_emergency_authority_never_opens_resumes_revokes_or_reconciles(self):
        (self.profile_dir / 'head.json').unlink()
        operator = self.operator()
        for command, args in [('resume', {}), ('bootstrap', {}), ('restore-reconcile', {}),
                              ('wave-open', {'capacity': 10, 'approve_added': 10}),
                              ('revoke', {'user': USER})]:
            with self.subTest(command), self.assertRaises(op.Refusal):
                operator.execute(command, args, emergency=True)
        self.assertEqual(self.applies(), [])

    def test_emergency_needs_an_observable_api_image(self):
        (self.profile_dir / 'head.json').unlink()
        self.runtime.observed['images']['api'] = 'not-an-image'
        with self.assertRaises(op.Refusal):
            self.operator().execute('pause', emergency=True)
        self.assertEqual(self.applies(), [])

    def test_with_a_valid_profile_an_emergency_flag_changes_nothing(self):
        result = self.operator().execute('pause', emergency=True)
        self.assertFalse(result['unverifiedAuthority'])

    # ---- closed set of requests ------------------------------------------
    def test_wave_open_needs_the_exact_added_capacity_and_a_real_increase(self):
        operator = self.operator()
        for args in [{'capacity': 10}, {'capacity': 10, 'approve_added': 9}, {'capacity': 10, 'approve_added': 11},
                     {'capacity': 0, 'approve_added': 0}, {'capacity': -1, 'approve_added': 0},
                     {'capacity': 100001, 'approve_added': 100001}, {'capacity': True, 'approve_added': 1}]:
            with self.subTest(args), self.assertRaises(op.Refusal):
                operator.execute('wave-open', args)
        self.assertEqual(self.applies(), [])
        operator.execute('wave-open', {'capacity': 10, 'approve_added': 10})
        self.assertEqual(self.runtime.policy['mode'], 'open')
        # The next wave only adds the difference and must exceed the used places.
        self.runtime.policy['admissionUsed'] = 10
        with self.assertRaises(op.Refusal):
            operator.execute('wave-open', {'capacity': 10, 'approve_added': 0})
        operator.execute('wave-open', {'capacity': 20, 'approve_added': 10})
        self.assertEqual(self.runtime.policy['admissionCapacity'], 20)

    def test_revoke_requires_an_active_admission_and_uses_its_revision(self):
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('revoke', {'user': USER})
        self.runtime.admissions[USER] = {'revision': 3, 'state': 'revoked'}
        with self.assertRaises(op.Refusal):
            operator.execute('revoke', {'user': USER})
        self.runtime.admissions[USER] = {'revision': 3, 'state': 'active'}
        result = operator.execute('revoke', {'user': USER})
        intent = json.loads((self.state / result['operationId'] / 'intent.json').read_bytes())
        self.assertEqual(intent['request']['members'], [{'userId': USER, 'expectedRevision': 3, 'state': 'revoked'}])
        self.assertEqual(self.runtime.admissions[USER]['state'], 'revoked')

    def test_restore_reconcile_only_during_a_quarantine_and_resume_never_during_one(self):
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('restore-reconcile')
        self.runtime.policy['reconcileRequired'] = True
        with self.assertRaisesRegex(op.Refusal, 'quarantine'):
            operator.execute('resume')
        operator.execute('restore-reconcile')
        self.assertFalse(self.runtime.policy['reconcileRequired'])

    def test_bootstrap_only_without_a_policy_and_never_with_members(self):
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('bootstrap')
        self.runtime.policy = None
        with self.assertRaisesRegex(op.Refusal, 'bootstrap first'):
            operator.execute('pause')
        result = operator.execute('bootstrap')
        intent = json.loads((self.state / result['operationId'] / 'intent.json').read_bytes())
        self.assertEqual(intent['request'], {'kind': 'bootstrap', 'members': []})
        with self.assertRaises(op.Refusal):
            operator.build_request('sql', {'policy': {'revision': 1}, 'accounts': []}, {})

    # ---- lost responses, reconcile ----------------------------------------
    def test_a_lost_apply_response_blocks_new_operations_until_a_readonly_reconcile(self):
        self.runtime.lose_apply = True
        operator = self.operator()
        with self.assertRaisesRegex(op.Refusal, 'SQL is never repeated'):
            operator.execute('resume')
        operation_id = op.Journal(self.state).unfinished_all()[0]['operationId']
        self.assertEqual([r['event'] for r in self.rows()], ['intent-persisted', 'apply-started', 'apply-unknown'])
        self.runtime.lose_apply = False
        with self.assertRaisesRegex(op.Refusal, 'reconcile it first'):
            operator.execute('pause')
        self.assertEqual(len(self.applies()), 1)  # SQL was not repeated
        outcome = operator.reconcile(operation_id)
        self.assertEqual(outcome['outcome'], 'committed')
        self.assertEqual(self.rows()[-1]['event'], 'reconciled-committed')
        self.assertEqual(op.Journal(self.state).unfinished_all(), [])
        operator.execute('pause')  # normal service resumes

    def test_an_uncommitted_reconcile_changes_nothing_and_needs_a_new_operation(self):
        self.runtime.fail_before_sql = True
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        operation_id = op.Journal(self.state).unfinished_all()[0]['operationId']
        before = copy.deepcopy(self.runtime.policy)
        with self.assertRaisesRegex(op.Refusal, 'not expired yet'):
            operator.reconcile(operation_id)  # a still-running apply could yet commit
        self.assertEqual(op.Journal(self.state).unfinished_all()[0]['operationId'], operation_id)
        self.tick = 1000                      # past the 15 minute validity of the intent
        result = operator.reconcile(operation_id)
        self.assertEqual(result['outcome'], 'uncommitted')
        self.assertEqual(self.runtime.policy, before)
        self.assertEqual(len(self.applies()), 1)
        self.assertEqual(self.rows()[-1]['event'], 'reconciled-uncommitted')
        self.runtime.fail_before_sql = False
        self.assertEqual(operator.execute('resume')['outcome'], 'committed')

    def test_reconcile_refuses_an_unknown_finished_or_tampered_operation(self):
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.reconcile(str(uuid.uuid4()))
        finished = operator.execute('pause')['operationId']
        with self.assertRaises(op.Refusal):
            operator.reconcile(finished)
        self.runtime.lose_apply = True
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        operation_id = op.Journal(self.state).unfinished_all()[0]['operationId']
        path = self.state / operation_id / 'intent.json'
        path.write_bytes(path.read_bytes().replace(b'"resume"', b'"other"') + b' ')
        with self.assertRaisesRegex(op.Refusal, 'does not match the journal'):
            operator.reconcile(operation_id)

    def test_an_emergency_stop_is_not_blocked_by_an_unfinished_operation(self):
        self.runtime.lose_apply = True
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        self.runtime.lose_apply = False
        with self.assertRaises(op.Refusal):
            operator.execute('pause')  # normal path waits for the reconcile
        self.assertEqual(operator.execute('pause', emergency=True)['outcome'], 'committed')
        self.assertEqual(len(op.Journal(self.state).unfinished_all()), 1)

    # ---- accepting an unprovable outcome ------------------------------------
    def drifted(self):
        """A lost resume, then an emergency stop: the readback matches neither side."""
        self.runtime.lose_apply = True
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        self.runtime.lose_apply = False
        operator.execute('pause', emergency=True)
        self.runtime.drift = True
        operation_id = op.Journal(self.state).unfinished_all()[0]['operationId']
        phrase = operator.accept_drift_phrase(
            operation_id, op.Journal(self.state).last(operation_id, 'intent-persisted')['intentSha256'])
        return operator, operation_id, phrase

    def test_accept_drift_needs_the_exact_owner_confirmation_for_that_operation(self):
        operator, operation_id, phrase = self.drifted()
        with self.assertRaisesRegex(op.Refusal, '--accept-drift --confirm'):
            operator.reconcile(operation_id)  # plain reconcile cannot conclude and names the way out
        for confirm in (None, '', 'yes', phrase.replace(operation_id[:4], '0000'), phrase + ' '):
            with self.subTest(confirm), self.assertRaisesRegex(op.Refusal, 'Owner confirmation required'):
                operator.reconcile(operation_id, accept_drift=True, confirm=confirm)
        self.assertEqual(len(op.Journal(self.state).unfinished_all()), 1)
        self.assertNotIn('drift-accepted', [r['event'] for r in self.rows()])

    def test_accept_drift_journals_the_observed_state_and_changes_nothing_else(self):
        operator, operation_id, phrase = self.drifted()
        before = copy.deepcopy(self.runtime.policy)
        applies = len(self.applies())
        result = operator.reconcile(operation_id, accept_drift=True, confirm=phrase)
        self.assertEqual(result['outcome'], 'drift-accepted')
        row = self.rows()[-1]
        self.assertEqual((row['event'], row['operationId']), ('drift-accepted', operation_id))
        self.assertEqual(row['observedPolicy']['admissionCapacity'], before['admissionCapacity'])
        self.assertEqual(row['observedPolicySha256'], op.sha(op.canonical(row['observedPolicy'])))
        self.assertEqual(self.runtime.policy, before)          # no SQL, no capacity change, no opening
        self.assertEqual(len(self.applies()), applies)
        self.assertEqual(op.Journal(self.state).unfinished_all(), [])
        self.runtime.drift = False
        self.assertEqual(operator.execute('resume')['outcome'], 'committed')  # blocked no more
        self.assertEqual(len(op.Journal(self.state).rows()), len(self.rows()))  # chain still verifies
        with self.assertRaisesRegex(op.Refusal, 'No unfinished'):
            operator.reconcile(operation_id, accept_drift=True, confirm=phrase)

    def test_accept_drift_refuses_a_provable_outcome_an_open_wave_and_an_unverified_record(self):
        operator, operation_id, phrase = self.drifted()
        self.runtime.drift = False
        with self.assertRaisesRegex(op.Refusal, 'provable'):
            operator.reconcile(operation_id, accept_drift=True, confirm=phrase)
        self.runtime.drift = True
        self.runtime.policy.update(mode='open', admissionCapacity=3)
        with self.assertRaisesRegex(op.Refusal, 'Close the service first'):
            operator.reconcile(operation_id, accept_drift=True, confirm=phrase)
        self.runtime.policy.update(mode='invitation')
        self.runtime.observed['images']['api'] = 'sha256:' + '0' * 64  # running state no longer the profile
        with self.assertRaises(op.Refusal):
            operator.reconcile(operation_id, accept_drift=True, confirm=phrase)
        self.assertEqual(len(op.Journal(self.state).unfinished_all()), 1)

    def test_accept_drift_is_not_available_when_the_database_cannot_be_read(self):
        operator, operation_id, phrase = self.drifted()
        original = self.runtime.probe

        def broken(image_id, data, directory):
            if data['mode'] == 'service-status':
                raise RuntimeError('database unreachable')
            return original(image_id, data, directory)

        self.runtime.probe = broken
        with self.assertRaisesRegex(op.Refusal, 'could not be read'):
            operator.reconcile(operation_id, accept_drift=True, confirm=phrase)
        self.assertEqual(len(op.Journal(self.state).unfinished_all()), 1)

    # ---- review hardening ------------------------------------------------
    def test_an_emergency_stop_needs_only_the_api_image_not_a_perfect_runtime(self):
        self.runtime.observe_api_image = lambda: IMAGE
        for failure in (op.Refusal('Exactly one running container per service required'),
                        FileNotFoundError('server.env'), RuntimeError('docker failed'), ValueError('bad')):
            with self.subTest(type(failure).__name__):
                def broken(failure=failure):
                    raise failure
                self.runtime.observe = broken
                operator = self.operator()
                with self.assertRaises(Exception):
                    operator.execute('resume')              # normal operations still fail closed
                result = operator.execute('pause', emergency=True)
                self.assertEqual(result['outcome'], 'committed')
                self.assertTrue(result['unverifiedAuthority'])
        self.runtime.observe_api_image = lambda: (_ for _ in ()).throw(RuntimeError('no api'))
        with self.assertRaisesRegex(op.Refusal, 'api image could not be observed'):
            self.operator().execute('pause', emergency=True)

    def test_emergency_authority_cannot_carry_an_exposure_increasing_command(self):
        self.runtime.lose_apply = True
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        self.runtime.lose_apply = False
        applies = len(self.applies())
        for command, args in [('wave-open', {'capacity': 5, 'approve_added': 5}), ('resume', {}),
                              ('revoke', {'user': USER}), ('restore-reconcile', {}), ('bootstrap', {})]:
            with self.subTest(command), self.assertRaisesRegex(op.Refusal, 'limited to pause and wave close'):
                operator.execute(command, args, emergency=True)
        self.assertEqual(len(self.applies()), applies)
        with self.assertRaisesRegex(op.Refusal, 'reconcile it first'):
            operator.execute('wave-open', {'capacity': 5, 'approve_added': 5})  # the block stays in force

    def test_reconcile_waits_for_a_running_probe_container(self):
        self.runtime.lose_apply = True
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        operation_id = op.Journal(self.state).unfinished_all()[0]['operationId']
        self.runtime.probe_containers = True
        with self.assertRaisesRegex(op.Refusal, 'still running'):
            operator.reconcile(operation_id)
        self.assertNotIn('service-reconcile', [c[0] for c in self.runtime.calls if isinstance(c, tuple)])
        self.runtime.probe_containers = False
        self.assertEqual(operator.reconcile(operation_id)['outcome'], 'committed')

    def test_a_transient_reconcile_failure_is_never_taken_for_drift(self):
        operator, operation_id, phrase = self.drifted()
        self.runtime.drift = False
        self.runtime.transient = True
        with self.assertRaises(op.Refusal) as plain:
            operator.reconcile(operation_id)
        self.assertNotIn('--accept-drift', str(plain.exception))
        with self.assertRaisesRegex(op.Refusal, 'transient'):
            operator.reconcile(operation_id, accept_drift=True, confirm=phrase)
        self.assertNotIn('drift-accepted', [r['event'] for r in self.rows()])
        self.assertEqual(len(op.Journal(self.state).unfinished_all()), 1)

    def test_an_apply_receipt_that_is_not_an_exact_commit_leaves_the_operation_unfinished(self):
        for receipt in ({'outcome': 'uncommitted'}, {'outcome': 'weird'}, {}):
            with self.subTest(receipt):
                self.setUp()
                self.runtime.bad_receipt = receipt
                operator = self.operator()
                with self.assertRaisesRegex(op.Refusal, 'not an exact commit'):
                    operator.execute('resume')
                self.assertEqual(self.rows()[-1]['event'], 'apply-unknown')
                self.assertEqual(len(op.Journal(self.state).unfinished_all()), 1)

    # ---- hygiene ---------------------------------------------------------
    def test_a_prepared_intent_that_differs_from_the_request_is_refused_and_leaves_no_trace(self):
        runtime = self.runtime
        original = runtime.probe

        def tampered(image, data, directory):
            value = original(image, data, directory)
            if data['mode'] == 'service-prepare':
                value['intent']['request'] = {**value['intent']['request'], 'capacity': 99999}
            return value
        runtime.probe = tampered
        with self.assertRaisesRegex(op.Refusal, 'does not match the requested operation'):
            self.operator().execute('pause')
        self.assertEqual(self.rows(), [])
        self.assertEqual([p for p in self.state.iterdir() if p.is_dir()], [])
        self.assertEqual(self.applies(), [])

    def test_a_refusal_before_sql_removes_the_operation_directory(self):
        with self.assertRaises(op.Refusal):
            self.operator().execute('wave-open', {'capacity': 10})
        self.assertEqual([p for p in self.state.iterdir() if p.is_dir()], [])
        self.assertEqual(self.rows(), [])

    def test_database_status_must_be_the_reviewed_040_receipt(self):
        original = self.runtime.probe

        def wrong(image, data, directory):
            value = original(image, data, directory)
            if data['mode'] == 'service-status':
                value['schema'] = 39
            return value
        self.runtime.probe = wrong
        with self.assertRaisesRegex(op.Refusal, '040 receipt'):
            self.operator().execute('pause')
        self.assertEqual(self.applies(), [])

    def test_journal_tampering_is_detected_and_blocks_operations(self):
        operator = self.operator()
        operator.execute('pause')
        path = self.state / 'journal.jsonl'
        data = path.read_bytes()
        path.write_bytes(data.replace(b'"applied"', b'"intent-persisted"', 1))
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        path.write_bytes(data.splitlines(True)[1] + data.splitlines(True)[0] + b''.join(data.splitlines(True)[2:]))
        with self.assertRaises(op.Refusal):
            operator.execute('resume')
        path.write_bytes(data)
        path.chmod(0o644)
        with self.assertRaises(op.Refusal):
            operator.execute('resume')

    def test_a_second_concurrent_operation_is_refused_by_the_lock(self):
        with op.operation_lock(self.state):
            with self.assertRaisesRegex(op.Refusal, 'Another service operation'):
                with op.operation_lock(self.state):
                    pass

    def test_no_secrets_or_personal_data_in_the_journal_or_intent_files(self):
        self.runtime.admissions[USER] = {'revision': 1, 'state': 'active'}
        self.operator().execute('revoke', {'user': USER})
        text = (self.state / 'journal.jsonl').read_text()
        for needle in ('@', 'password', 'secret', 'sk_', 'postgres://'):
            self.assertNotIn(needle, text)

    # ---- command line and host adapter ------------------------------------
    def test_cli_has_no_free_form_sql_or_json_surface(self):
        parse = op.parser().parse_args
        self.assertEqual(parse(['wave', '--open', '--capacity', '10', '--approve-added', '10']).capacity, 10)
        for bad in (['sql', 'DROP TABLE ff_users'], ['wave'], ['wave', '--open', '--close'],
                    ['pause', '--sql', 'x'], ['revoke'], ['reconcile'], ['resume', '--emergency']):
            with self.subTest(bad), self.assertRaises(SystemExit):
                parse(bad)
        operator = self.operator()
        with self.assertRaises(op.Refusal):
            op.run(parse(['wave', '--close', '--capacity', '5']), operator, [])
        with self.assertRaises(op.Refusal):
            op.run(parse(['wave', '--open']), operator, [])
        with self.assertRaises(ValueError):
            op.run(parse(['revoke', '--user', 'not-a-uuid']), operator, [])

    def test_host_runtime_runs_the_exact_one_off_without_pull_and_cleans_up(self):
        owner = Path(self.temporary.name) / 'owner'
        owner.mkdir(mode=0o700)
        compose = {'services': {s: {'image': 'old', 'environment': {'SERVICE_ACCESS_ENFORCEMENT': 'true'}}
                                for s in op.SERVICES}}
        for name, data in [('effective-compose.json', op.canonical(compose)), ('server.env', b'KEY=value\n'),
                           ('pinned-image.json', b'{}\n')]:
            fd = os.open(owner / name, os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
            os.write(fd, data)
            os.close(fd)
        calls = []
        compose_files = []

        def runner(args, *, input=None, timeout=60):
            calls.append((args, input, timeout))
            if 'run' in args:
                path = Path(args[args.index('-f') + 1])
                compose_files.append((path, json.loads(path.read_bytes()), stat.S_IMODE(path.stat().st_mode)))
            if args[:2] == ['docker', 'compose'] and 'ps' in args:
                return (args[-1] + '-container\n').encode()
            if args[:2] == ['docker', 'inspect']:
                return (IMAGE + '\n').encode()
            if 'run' in args:
                return b'{"ok":true}\n'
            return b''
        runtime = op.HostRuntime(owner_dir=owner, runner=runner)
        observed = runtime.observe()
        self.assertEqual(observed['images'], {s: IMAGE for s in op.SERVICES})
        self.assertTrue(observed['serviceAccessEnforcement'])
        self.assertEqual(observed['serverEnvSha256'], hashlib.sha256(b'KEY=value\n').hexdigest())
        operation = Path(self.temporary.name) / 'op'
        operation.mkdir(mode=0o700)
        self.assertEqual(runtime.probe(IMAGE, {'mode': 'service-status', 'accounts': []}, operation), {'ok': True})
        run = next(c for c in calls if 'run' in c[0])
        for flag in ('-T', '--rm', '--no-deps', '--pull', 'never', '--entrypoint', 'node', 'api'):
            self.assertIn(flag, run[0])
        self.assertEqual(run[0][run[0].index('--pull') + 1], 'never')
        self.assertEqual(run[0][-3:], op.PROBE_COMMAND)
        self.assertEqual(json.loads(run[1]), {'mode': 'service-status', 'accounts': []})
        path, override, mode = compose_files[0]
        self.assertEqual(override['services']['api']['image'], IMAGE)
        self.assertEqual(mode, 0o600)
        # The compose copy holds the service environment: never left behind, never in the evidence root.
        self.assertFalse(path.exists())
        self.assertEqual(list(operation.iterdir()), [])
        self.assertTrue(any(c[0][:3] == ['docker', 'rm', '-f'] for c in calls))
        # The one-off never gets a shell and never an env/secret on the command line.
        self.assertFalse(any('sh' == a or '-c' == a for c in calls for a in c[0]))

    def test_host_runtime_requires_exactly_one_container_per_service(self):
        owner = Path(self.temporary.name) / 'owner2'
        owner.mkdir(mode=0o700)
        compose = {'services': {s: {'environment': {}} for s in op.SERVICES}}
        fd = os.open(owner / 'effective-compose.json', os.O_CREAT | os.O_WRONLY | os.O_EXCL, 0o600)
        os.write(fd, op.canonical(compose))
        os.close(fd)
        for output in (b'', b'a\nb\n'):
            runtime = op.HostRuntime(owner_dir=owner, runner=lambda *a, **k: output)
            with self.subTest(output), self.assertRaises(op.Refusal):
                runtime.observe()


if __name__ == '__main__':
    unittest.main()
