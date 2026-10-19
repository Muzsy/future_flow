import copy
import datetime as dt
import importlib.util
from pathlib import Path
import signal
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('alterward_funded_policy',
                                              ROOT / 'scripts/ops/contabo-funded-upgrade-policy.py')
policy = importlib.util.module_from_spec(spec)
sys.modules['alterward_funded_policy'] = policy
spec.loader.exec_module(policy)

OLD = 'sha256:' + 'a' * 64
NEW = 'sha256:' + 'b' * 64
RECOVERY = 'sha256:' + 'c' * 64
USERS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'


def funded_config(image=OLD, narrative=False):
    shared = {'CLOSED_SITE_ENABLED': 'true', 'DATABASE_URL': 'postgresql://synthetic',
              'AI_PROJECT_BUDGET_USD': '10', 'AI_USER_BUDGET_USD': '3.34',
              'CLOSED_BETA_USER_IDS': USERS, 'GENERATION_DAILY_LIMIT': '3',
              'GENERATION_CONCURRENT_LIMIT': '1', 'SHARED_GENERATION_DAILY_LIMIT': '3',
              'SHARED_GENERATION_CONCURRENT_LIMIT': '1', 'PUBLIC_REVIEW_DAILY_LIMIT': '5'}
    config = {'name': 'alterward-owner', 'services': {
        'web': {'image': image, 'environment': {'CLOSED_SITE_ENABLED': 'true',
                                                'CLOSED_SITE_ALLOWED_EMAILS': 'owner@example.com,reader@example.com'}},
        'api': {'image': image, 'environment': dict(shared)},
        'worker': {'image': image, 'environment': {
            **shared, 'OPENAI_API_KEY': 'synthetic_funded_provider_value',
            'AI_BUDGET_WINDOW_REQUIRED': 'true', 'AI_BUDGET_WINDOW_START': '2026-10-13T10:00:00Z',
            'AI_BUDGET_WINDOW_END': '2026-11-12T10:00:00Z'}}}}
    if narrative:
        for name, values in policy.NARRATIVE_DEFAULTS.items():
            config['services'][name]['environment'].update(values)
    return config


def observation(**changes):
    value = {
        'version': policy.OBSERVATION_VERSION,
        'schema': {'migrations': [{'name': '037_shared_sponsored_guest_seats.sql', 'checksum': '1' * 64}],
                   'migrationsSha256': '0' * 64, 'narrativeArtifactColumn': False},
        'ledger': {'accountCount': 3, 'accountsSha256': '2' * 64, 'limitMicroTotal': '13340000',
                   'accountedMicroTotal': '1200000', 'reservationCount': 4, 'reservationsSha256': '3' * 64,
                   'reservations': {'reserved': {'count': 0, 'reservedMicro': '0', 'accountedMicro': '0'},
                                    'completed': {'count': 3, 'reservedMicro': '900', 'accountedMicro': '800'},
                                    'unknown': {'count': 1, 'reservedMicro': '400', 'accountedMicro': '400'}}},
        'queue': {'pendingJobs': 0, 'liveLeases': 0, 'generatingBranches': 0,
                  'frozenNarrativeJobs': {'completed': 2}},
        'policies': [{'policySha256': 'd' * 64, 'policy': {'mode': 'narrative-fiction-v2'},
                      'sources': {'jobPayloads': 1, 'jobCheckpoints': 1, 'storedArtifacts': 2}}],
        'artifacts': {'stored': 2, 'legacyNull': 5, 'storedSha256': '4' * 64, 'periods': 7},
        'accounts': {'userCount': 3, 'usersSha256': '5' * 64}}
    for path, item in changes.items():
        target = value
        keys = path.split('.')
        for key in keys[:-1]:
            target = target[key]
        target[keys[-1]] = item
    return value


MIGRATIONS = [{'name': '037_shared_sponsored_guest_seats.sql', 'checksum': '1' * 64},
              {'name': '038_narrative_artifacts.sql', 'checksum': '6' * 64}]


def capability(image, migrations=MIGRATIONS, accepted=('d' * 64,), rejected=()):
    return {'version': policy.CAPABILITY_VERSION, 'imageId': image, 'migrations': migrations,
            'migrationsSha256': '0' * 64, 'accepted': list(accepted), 'rejected': list(rejected),
            'fictionPipeline': True, 'narrativeV1Pipeline': True}


class RenderDeltaTests(unittest.TestCase):
    def test_only_image_and_narrative_defaults_may_change(self):
        result = policy.validate_render_delta(funded_config(), funded_config(NEW, narrative=True),
                                              previous_image=OLD, candidate_image=NEW)
        self.assertEqual(set(result), {'previousRenderSha256', 'candidateRenderSha256'})
        self.assertEqual(policy.protected_environment(funded_config()),
                         policy.protected_environment(funded_config(NEW, narrative=True)))

    def test_non_default_cohort_deadline_or_envelope_is_refused(self):
        for service, key, value in [('api', 'NARRATIVE_COHORT_USER_IDS', USERS.split(',')[0]),
                                    ('worker', 'NARRATIVE_PIPELINE_MODE', 'narrative-fiction-v2'),
                                    ('worker', 'AI_FICTION_TIMEOUT_MS', '300000'),
                                    ('worker', 'AI_FICTION_MAX_REQUEST_BYTES', '196608')]:
            candidate = funded_config(NEW, narrative=True)
            candidate['services'][service]['environment'][key] = value
            with self.subTest(key=key), self.assertRaises(policy.UpgradeRefused):
                policy.validate_render_delta(funded_config(), candidate, previous_image=OLD, candidate_image=NEW)

    def test_every_funded_value_is_frozen(self):
        for service, key, value in [('worker', 'AI_BUDGET_WINDOW_END', '2026-12-12T10:00:00Z'),
                                    ('worker', 'AI_BUDGET_WINDOW_START', '2026-10-19T10:00:00Z'),
                                    ('worker', 'AI_PROJECT_BUDGET_USD', '20'),
                                    ('api', 'AI_USER_BUDGET_USD', '5'),
                                    ('api', 'CLOSED_BETA_USER_IDS', USERS + ',cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
                                    ('web', 'CLOSED_SITE_ALLOWED_EMAILS', 'owner@example.com,new@example.com'),
                                    ('api', 'GENERATION_DAILY_LIMIT', '9'),
                                    ('api', 'GENERATION_CONCURRENT_LIMIT', '2'),
                                    ('worker', 'OPENAI_API_KEY', 'synthetic_rotated_value')]:
            candidate = funded_config(NEW, narrative=True)
            candidate['services'][service]['environment'][key] = value
            with self.subTest(key=key), self.assertRaises(policy.UpgradeRefused):
                policy.validate_render_delta(funded_config(), candidate, previous_image=OLD, candidate_image=NEW)

    def test_same_image_mixed_images_and_unknown_narrative_keys_are_refused(self):
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_render_delta(funded_config(), funded_config(OLD, True), previous_image=OLD, candidate_image=OLD)
        mixed = funded_config(NEW, True)
        mixed['services']['worker']['image'] = OLD
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_render_delta(funded_config(), mixed, previous_image=OLD, candidate_image=NEW)
        extra = funded_config(NEW, True)
        extra['services']['worker']['environment']['NARRATIVE_FORCE'] = 'true'
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_render_delta(funded_config(), extra, previous_image=OLD, candidate_image=NEW)

    def test_build_context_may_differ_only_as_each_verified_source(self):
        previous, candidate = funded_config(), funded_config(NEW, narrative=True)
        for config, context in ((previous, '/root/alterward-ops/target/old'), (candidate, '/root/alterward-ops/target/new')):
            for service in config['services'].values():
                service['build'] = {'context': context, 'dockerfile': 'Dockerfile'}
        self.assertEqual(policy.build_context(previous), '/root/alterward-ops/target/old')
        policy.validate_render_delta(previous, candidate, previous_image=OLD, candidate_image=NEW,
                                     previous_source=policy.build_context(previous),
                                     candidate_source='/root/alterward-ops/target/new')
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_render_delta(previous, candidate, previous_image=OLD, candidate_image=NEW,
                                         previous_source=policy.build_context(previous),
                                         candidate_source='/root/alterward-ops/target/other')
        candidate['services']['web']['build']['dockerfile'] = 'Other.Dockerfile'
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_render_delta(previous, candidate, previous_image=OLD, candidate_image=NEW,
                                         previous_source=policy.build_context(previous),
                                         candidate_source='/root/alterward-ops/target/new')

    def test_environment_file_may_change_only_the_tag_line(self):
        before = "A='1'\nALTERWARD_TAG='contabo-aaaaaaaaaaaa'\nAI_PROJECT_BUDGET_USD='10'\n"
        after = before.replace('aaaaaaaaaaaa', 'bbbbbbbbbbbb')
        self.assertTrue(policy.same_except_tag(before, after, 'alterward:contabo-bbbbbbbbbbbb'))
        for text in [after.replace("'10'", "'20'"), after + "X='1'\n", before]:
            with self.assertRaises(policy.UpgradeRefused):
                policy.same_except_tag(before, text, 'alterward:contabo-bbbbbbbbbbbb')


class AuthorityTests(unittest.TestCase):
    prepared_bytes = b'{"manifest":{}}'

    def authority(self, journal=None, transition=None, config=None):
        sha = policy.sha(self.prepared_bytes)
        return policy.validate_funded_authority(
            personal_prepared={'manifest': {}}, personal_prepared_bytes=self.prepared_bytes,
            personal_journal=journal if journal is not None else {
                'state': 'exposure-committed', 'preparedSha256': sha,
                'startsAt': '2026-10-13T10:00:00Z', 'endsAt': '2026-11-12T10:00:00Z'},
            personal_transition=transition if transition is not None else {'state': 'applied', 'preparedSha256': sha},
            live_config=config or funded_config())

    def test_active_funded_runtime_is_bound_to_the_one_time_activation(self):
        value = self.authority()
        self.assertEqual((value['windowStart'], value['windowEnd'], value['participantCount']),
                         ('2026-10-13T10:00:00Z', '2026-11-12T10:00:00Z', 2))
        self.assertNotIn('synthetic_funded_provider_value', policy.encoded(value).decode())
        self.assertNotIn(USERS.split(',')[0], policy.encoded(value).decode())

    def test_owner_zero_or_owner_upgrade_receipts_cannot_substitute(self):
        owner_zero = funded_config()
        for name in ('api', 'worker'):
            owner_zero['services'][name]['environment']['CLOSED_BETA_USER_IDS'] = ''
        for kwargs in [dict(journal={}), dict(transition={'state': 'rolled-back'}),
                       dict(journal={'state': 'applied', 'preparedSha256': policy.sha(self.prepared_bytes)}),
                       dict(transition={'state': 'disabled', 'preparedSha256': policy.sha(self.prepared_bytes)}),
                       dict(config=owner_zero)]:
            with self.subTest(kwargs=list(kwargs)), self.assertRaises(policy.UpgradeRefused):
                self.authority(**kwargs)

    def test_window_cannot_be_restarted_or_extended(self):
        for key, value in [('AI_BUDGET_WINDOW_START', '2026-10-19T12:00:00Z'),
                           ('AI_BUDGET_WINDOW_END', '2026-11-18T12:00:00Z')]:
            config = funded_config()
            config['services']['worker']['environment'][key] = value
            with self.assertRaises(policy.UpgradeRefused):
                self.authority(config=config)


class DrainAndLedgerTests(unittest.TestCase):
    def test_flag_off_alone_never_counts_as_drained(self):
        legacy = {'NARRATIVE_PIPELINE_MODE': 'legacy', 'NARRATIVE_COHORT_USER_IDS': ''}
        for path, value in [('queue.pendingJobs', 1), ('queue.liveLeases', 1),
                            ('queue.generatingBranches', 1),
                            ('ledger.reservations', {'reserved': {'count': 1}}),
                            ('queue.frozenNarrativeJobs', {'queued': 1}),
                            ('queue.frozenNarrativeJobs', {'running': 1})]:
            with self.subTest(path=path), self.assertRaises(policy.UpgradeRefused):
                policy.drain_decision(observation(**{path: value}), runtime_flags=legacy)
        self.assertTrue(policy.drain_decision(observation(), runtime_flags=legacy)['drained'])

    def test_ledger_usage_reservations_accounts_and_artifacts_must_be_identical(self):
        self.assertTrue(policy.require_preserved(observation(), observation()))
        # Schema growth (038) alone is the allowed difference.
        self.assertTrue(policy.require_preserved(observation(), observation(**{
            'schema.migrations': MIGRATIONS, 'schema.narrativeArtifactColumn': True})))
        for path, value in [('ledger.accountedMicroTotal', '0'), ('ledger.limitMicroTotal', '20000000'),
                            ('ledger.reservationCount', 0), ('ledger.reservationsSha256', '9' * 64),
                            ('ledger.accountsSha256', '9' * 64), ('accounts.usersSha256', '9' * 64),
                            ('artifacts.storedSha256', '9' * 64), ('artifacts.stored', 0),
                            ('policies', [])]:
            with self.subTest(path=path), self.assertRaises(policy.UpgradeRefused):
                policy.require_preserved(observation(), observation(**{path: value}))


class SchemaAndRecoveryTests(unittest.TestCase):
    def test_target_must_extend_history_and_add_038(self):
        result = policy.expected_schema_transition(observation(), capability(NEW))
        self.assertEqual(result['pending'], ['038_narrative_artifacts.sql'])
        with self.assertRaises(policy.UpgradeRefused):
            policy.expected_schema_transition(observation(), capability(NEW, migrations=MIGRATIONS[:1]))
        changed = [{'name': MIGRATIONS[0]['name'], 'checksum': '7' * 64}, MIGRATIONS[1]]
        with self.assertRaises(policy.UpgradeRefused):
            policy.expected_schema_transition(observation(), capability(NEW, migrations=changed))

    def test_applied_schema_must_equal_target_image(self):
        after = observation(**{'schema.migrations': MIGRATIONS, 'schema.narrativeArtifactColumn': True})
        self.assertTrue(policy.require_schema(after, capability(NEW)))
        with self.assertRaises(policy.UpgradeRefused):
            policy.require_schema(observation(), capability(NEW))

    def test_pre_038_or_policy_blind_or_unreviewed_recovery_is_refused(self):
        target = capability(NEW)
        accepted = policy.validate_recovery_target(capability(RECOVERY), target=target,
                                                   observation=observation(), reviewed_images={RECOVERY})
        self.assertFalse(accepted['sameAsTarget'])
        self.assertTrue(policy.validate_recovery_target(capability(NEW), target=target, observation=observation(),
                                                        reviewed_images=set())['sameAsTarget'])
        cases = [capability(RECOVERY, migrations=MIGRATIONS[:1]),  # pre-038 image
                 capability(RECOVERY, accepted=(), rejected=('d' * 64,)),  # cannot read stored v-n policy
                 capability(RECOVERY, accepted=('d' * 64,), rejected=('d' * 64,))]
        for case in cases:
            with self.assertRaises(policy.UpgradeRefused):
                policy.validate_recovery_target(case, target=target, observation=observation(),
                                                reviewed_images={RECOVERY})
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_recovery_target(capability(RECOVERY), target=target, observation=observation(),
                                            reviewed_images=set())

    def test_capability_must_be_for_the_exact_image(self):
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_capability(capability(NEW), image_id=RECOVERY)


def candidate(now, **changes):
    value = {key: '0' * 64 for key in policy.CANDIDATE_KEYS}
    value.update(schema=policy.CANDIDATE_SCHEMA, sourceCommit='e' * 40, auditSourceCommit='e' * 40,
                 targetCommit='e' * 40, activeCommit='f' * 40, recoveryCommit='e' * 40,
                 activeImageId=OLD, targetImageId=NEW, recoveryImageId=NEW, ciRunIds=[1, 2],
                 preparedAt=now.isoformat(),
                 expiresAt=(now + dt.timedelta(seconds=policy.PREPARATION_SECONDS)).isoformat())
    value.update(changes)
    return value


class CandidateTests(unittest.TestCase):
    now = dt.datetime(2026, 10, 19, 12, 0, tzinfo=dt.timezone.utc)

    def test_short_lived_exact_candidate(self):
        self.assertTrue(policy.validate_candidate(candidate(self.now), now=self.now + dt.timedelta(seconds=899)))
        refusals = [(candidate(self.now), self.now + dt.timedelta(seconds=901)),  # stale
                    (candidate(self.now), self.now - dt.timedelta(seconds=1)),  # future
                    (candidate(self.now, expiresAt=(self.now + dt.timedelta(hours=1)).isoformat()), self.now),
                    (candidate(self.now, auditSourceCommit='1' * 40), self.now),
                    (candidate(self.now, targetImageId=OLD), self.now),
                    (candidate(self.now, ciRunIds=[]), self.now),
                    ({**candidate(self.now), 'extra': True}, self.now)]
        for value, now in refusals:
            with self.assertRaises(policy.UpgradeRefused):
                policy.validate_candidate(value, now=now)
        missing = candidate(self.now)
        missing.pop('ledgerSha256')
        with self.assertRaises(policy.UpgradeRefused):
            policy.validate_candidate(missing, now=self.now)

    def test_terminal_journal_cannot_continue(self):
        first = policy.journal_record('intent', prepared_sha256='a' * 64, now=self.now)
        applied = policy.journal_record('applied', prepared_sha256='a' * 64, previous=first, now=self.now)
        self.assertEqual([h['state'] for h in applied['history']], ['intent', 'applied'])
        with self.assertRaises(policy.UpgradeRefused):
            policy.journal_record('recovered-compatible', prepared_sha256='a' * 64, previous=applied, now=self.now)
        with self.assertRaises(policy.UpgradeRefused):
            policy.journal_record('done', prepared_sha256='a' * 64, now=self.now)


class TransitionTests(unittest.TestCase):
    def setUp(self):
        self.signals = {n: signal.getsignal(n) for n in (signal.SIGHUP, signal.SIGTERM, signal.SIGINT)}
        self.events = []
        self.schema = False

    def tearDown(self):
        for n, handler in self.signals.items():
            signal.signal(n, handler)

    def run_transition(self, failure=None, recovery=True, schema_probe=None, recovery_failure=None):
        def step(name, effect=None):
            def call():
                self.events.append(name)
                if name == failure or (name == recovery_failure and 'stop' in self.events[1:]):
                    raise RuntimeError('synthetic ' + name)
                if effect:
                    effect()
            return call
        def migrate():
            self.schema = True
        policy.transition(
            record=lambda state: self.events.append('record:' + state), stop=step('stop'), held=step('held'),
            migrate=step('migrate', migrate), verify_schema=step('verify-schema'), promote=step('promote'),
            start_origin=step('start-origin'), verify_origin=step('verify-origin'),
            start_worker=step('start-worker'), verify_runtime=step('verify-runtime'),
            schema_applied=schema_probe or (lambda: self.schema),
            restore_previous=step('restore-previous'), verify_previous=step('verify-previous'),
            start_recovery=step('start-recovery') if recovery else None,
            verify_recovery=step('verify-recovery'))

    def test_success_order_keeps_worker_last(self):
        self.run_transition()
        self.assertEqual(self.events, [
            'record:intent', 'stop', 'record:stopped', 'held', 'record:held', 'migrate',
            'record:schema-applied', 'verify-schema', 'record:schema-verified', 'promote', 'record:promoted',
            'start-origin', 'verify-origin', 'record:origin-verified', 'start-worker', 'verify-runtime',
            'record:applied'])

    def test_failure_before_schema_restores_previous_funded_runtime(self):
        with self.assertRaises(RuntimeError):
            self.run_transition(failure='held')
        self.assertNotIn('migrate', self.events)
        self.assertEqual(self.events[-4:], ['stop', 'restore-previous', 'verify-previous', 'record:restored-previous'])

    def test_failed_post_check_after_schema_uses_only_compatible_recovery(self):
        for failure in ('verify-schema', 'verify-origin', 'verify-runtime', 'start-worker'):
            self.events, self.schema = [], False
            with self.subTest(failure=failure), self.assertRaises(RuntimeError):
                self.run_transition(failure=failure)
            self.assertNotIn('restore-previous', self.events)
            self.assertEqual(self.events[-4:], ['stop', 'start-recovery', 'verify-recovery',
                                                'record:recovered-compatible'])

    def test_without_compatible_recovery_serving_stays_closed(self):
        with self.assertRaises(RuntimeError):
            self.run_transition(failure='verify-origin', recovery=False)
        self.assertEqual(self.events[-2:], ['stop', 'record:closed-recovery-required'])
        self.assertNotIn('restore-previous', self.events)

    def test_unknown_schema_state_is_treated_as_post_038(self):
        def unknown():
            raise RuntimeError('database unreachable')
        with self.assertRaises(RuntimeError):
            self.run_transition(failure='held', recovery=False, schema_probe=unknown)
        self.assertNotIn('restore-previous', self.events)
        self.assertEqual(self.events[-1], 'record:closed-recovery-required')

    def test_interruption_after_migration_before_journal_is_decided_by_the_database(self):
        # migrate committed but the process "died" before recording schema-applied.
        def migrate_then_fail():
            self.schema = True
            raise RuntimeError('killed')
        events = []
        with self.assertRaises(RuntimeError):
            policy.transition(record=lambda s: events.append(s), stop=lambda: events.append('stop'),
                              held=lambda: None, migrate=migrate_then_fail, verify_schema=None, promote=None,
                              start_origin=None, verify_origin=None, start_worker=None, verify_runtime=None,
                              schema_applied=lambda: self.schema, restore_previous=lambda: events.append('old'),
                              verify_previous=lambda: None, start_recovery=None, verify_recovery=None)
        self.assertNotIn('old', events)
        self.assertEqual(events[-1], 'closed-recovery-required')

    def test_failed_recovery_stops_again_and_records_closed(self):
        with self.assertRaises(RuntimeError):
            self.run_transition(failure='verify-origin', recovery_failure='verify-recovery')
        self.assertEqual(self.events[-2:], ['stop', 'record:closed-recovery-required'])

    def test_explicit_recovery_from_a_stopped_pre_schema_journal(self):
        events = []
        state = policy.fail_closed(record=events.append, stop=lambda: events.append('stop'),
                                   schema_applied=lambda: False, restore_previous=lambda: events.append('old'),
                                   verify_previous=lambda: events.append('verified'), start_recovery=None,
                                   verify_recovery=None)
        self.assertEqual((state, events), ('restored-previous', ['stop', 'old', 'verified', 'restored-previous']))


if __name__ == '__main__':
    unittest.main()
