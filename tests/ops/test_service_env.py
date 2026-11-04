"""Service-env step (P2): fake host, no Docker, DB, Auth or real owner files."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('service_env', directory / 'contabo-service-env.py')
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)

NOW = dt.datetime(2026, 11, 4, 9, 0, tzinfo=dt.timezone.utc)
IMAGE = 'sha256:' + 'b' * 64
COMMIT = 'a' * 40
AUD = 'c' * 64
SECRETS = ['sk_live_FAKESECRET', 'whsec_FAKEWEBHOOK', 'sk-real-fake-provider', 'postgresql://u:FAKEPASSWORD@h/db']
OLD_USER = '11111111-1111-4111-8111-111111111111'

SERVER_ENV = f"""# owner env (test)
PUBLIC_HOST='alterward.com'
ALTERWARD_TAG='release'
DATABASE_URL='{SECRETS[3]}'
OPENAI_API_KEY='{SECRETS[2]}'
CLOSED_SITE_ENABLED='true'
CLOUDFLARE_ACCESS_TEAM_DOMAIN='team.cloudflareaccess.com'
CLOUDFLARE_ACCESS_AUD='{'d' * 64}'
CLOSED_BETA_ENABLED='true'
CLOSED_BETA_USER_IDS='{OLD_USER}'
NARRATIVE_COHORT_USER_IDS='{OLD_USER}'
AI_PROJECT_BUDGET_USD='3.34'
AI_USER_BUDGET_USD='3.34'
AI_BUDGET_WINDOW_REQUIRED='true'
AI_BUDGET_WINDOW_START='2026-10-28T00:17:00Z'
AI_BUDGET_WINDOW_END='2026-11-27T00:17:00Z'
BILLING_ENABLED='true'
BILLING_ENFORCEMENT='true'
STRIPE_SECRET_KEY='{SECRETS[0]}'
STRIPE_WEBHOOK_SECRET='{SECRETS[1]}'
SERVICE_ACCESS_ENFORCEMENT='false'
"""

KEYS = {
    'web': ['CLOSED_SITE_ENABLED', 'CLOUDFLARE_ACCESS_TEAM_DOMAIN', 'CLOUDFLARE_ACCESS_AUD',
            'SERVICE_ACCESS_ENFORCEMENT', 'TURNSTILE_SITE_KEY'],
    'api': ['CLOSED_SITE_ENABLED', 'CLOUDFLARE_ACCESS_TEAM_DOMAIN', 'CLOUDFLARE_ACCESS_AUD',
            'SERVICE_ACCESS_ENFORCEMENT', 'CLOSED_BETA_USER_IDS', 'NARRATIVE_COHORT_USER_IDS',
            'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD', 'GENERATION_DAILY_LIMIT', 'BILLING_ENABLED',
            'BILLING_ENFORCEMENT', 'STRIPE_SECRET_KEY', 'DATABASE_URL'],
    'worker': ['SERVICE_ACCESS_ENFORCEMENT', 'CLOSED_BETA_USER_IDS', 'NARRATIVE_COHORT_USER_IDS',
               'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD', 'AI_BUDGET_WINDOW_REQUIRED',
               'AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END', 'BILLING_ENABLED', 'BILLING_ENFORCEMENT',
               'STRIPE_SECRET_KEY', 'OPENAI_API_KEY', 'DATABASE_URL'],
}
DEFAULTS = {'SERVICE_ACCESS_ENFORCEMENT': 'false', 'GENERATION_DAILY_LIMIT': '3'}


def sha(data):
    return hashlib.sha256(data).hexdigest()


class FakeHost:
    def __init__(self, owner):
        self.owner = owner
        self.jobs = 0
        self.images_value = {s: IMAGE for s in env.SERVICES}
        self.source_digest = 'e' * 64
        self.extra_env = None          # a render that smuggles an extra variable
        self.running = None
        self.restart_failures = 0      # remaining failing restarts
        self.verify_failures = 0
        self.calls = []

    def images(self):
        return dict(self.images_value)

    def pending_jobs(self):
        return self.jobs

    def source_sha256(self, source):
        return self.source_digest

    def render(self, env_bytes, pinned_bytes, source):
        values = env.parse_env(env_bytes.decode())
        services = {}
        for name, keys in KEYS.items():
            environment = {k: values.get(k, DEFAULTS.get(k, '')) for k in keys}
            if self.extra_env and name == 'api':
                environment[self.extra_env] = 'x'
            services[name] = {'image': IMAGE, 'command': ['run', name], 'environment': environment,
                              'cap_drop': ['ALL']}
        return {'services': services}

    def restart(self):
        self.calls.append('restart')
        if self.restart_failures:
            self.restart_failures -= 1
            raise env.Refusal('restart failed')
        self.running = env.unfrozen(json.loads((self.owner / 'effective-compose.json').read_bytes()))

    def verify_running(self, config, image_id):
        self.calls.append('verify')
        if self.verify_failures:
            self.verify_failures -= 1
            raise env.Refusal('unhealthy')
        for name in env.SERVICES:
            if self.running['services'][name]['environment'] != config['services'][name]['environment']:
                raise env.Refusal('running differs')

    def observe(self):
        files = {n: (self.owner / n).read_bytes() for n in ('effective-compose.json', 'server.env',
                                                            'pinned-image.json')}
        return {'images': dict(self.images_value), 'effectiveComposeSha256': sha(files['effective-compose.json']),
                'serverEnvSha256': sha(files['server.env']), 'pinnedImageSha256': sha(files['pinned-image.json']),
                'serviceAccessEnforcement': all(
                    self.running['services'][s]['environment']['SERVICE_ACCESS_ENFORCEMENT'] == 'true'
                    for s in env.SERVICES)}


def make_private(path):
    path.mkdir(mode=0o700, exist_ok=True)
    os.chmod(path, 0o700)


@unittest.skipIf(os.name != 'posix', 'POSIX permission, ownership and lock checks')
class ServiceEnvTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.ops = Path(self.temporary.name) / 'alterward-ops'
        make_private(self.ops)
        self.owner = self.ops / 'owner'
        make_private(self.owner)
        self.step, self.profile_dir = self.ops / 'service-env', self.ops / 'service-profile'
        make_private(self.step)
        self.state = Path(self.temporary.name) / 'service-operations'
        make_private(self.state)
        self.host = FakeHost(self.owner)
        text = SERVER_ENV
        pinned = env.encoded({'services': {s: {'image': IMAGE, 'pull_policy': 'never'} for s in env.SERVICES}})
        compose = env.frozen(self.host.render(text.encode(), pinned, 'src'))
        manifest = {'commit': COMMIT, 'imageId': IMAGE, 'ownerEnvironmentSha256': sha(text.encode()),
                    'effectiveComposeSha256': sha(compose), 'sourceComposeSha256': self.host.source_digest}
        for name, data in {'server.env': text.encode(), 'effective-compose.json': compose,
                           'pinned-image.json': pinned, 'manifest.json': env.encoded(manifest)}.items():
            env._create(self.owner / name, data)
        for name in ('backup-manifest.json', 'restore-proof.json', 'parent-readback.json'):
            env._create(self.ops / name, name.encode())
        self.host.running = env.unfrozen(json.loads(compose))
        self.tick = 0
        self.stepper = self.make_stepper()

    def make_stepper(self):
        return env.Stepper(owner_dir=self.owner, step_dir=self.step, profile_dir=self.profile_dir,
                           state_dir=self.state, host=self.host, clock=self.clock,
                           identity=lambda: ('operator', 'host'))

    def clock(self):
        self.tick += 1
        return NOW + dt.timedelta(seconds=self.tick)

    def request(self, **values):
        base = {'SERVICE_ACCESS_ENFORCEMENT': 'true', 'CLOSED_SITE_ENABLED': 'true',
                'CLOUDFLARE_ACCESS_AUD': AUD, 'CLOSED_BETA_USER_IDS': '', 'NARRATIVE_COHORT_USER_IDS': '',
                'AI_PROJECT_BUDGET_USD': '45', 'AI_USER_BUDGET_USD': '6', 'GENERATION_DAILY_LIMIT': '2',
                'AI_BUDGET_WINDOW_START': '2026-11-05T00:00:00Z', 'AI_BUDGET_WINDOW_END': '2026-12-05T00:00:00Z'}
        base.update(values)
        return {'version': env.REQUEST_VERSION, 'imageId': IMAGE,
                'sourceDirectory': '/root/alterward-ops/release/src', 'values': base,
                'backupManifestPath': 'backup-manifest.json', 'restoreProofPath': 'restore-proof.json',
                'parentReadbackPath': 'parent-readback.json'}

    def snapshot(self):
        return {n: (self.owner / n).read_bytes() for n in env.OWNER_FILES}

    def apply(self, request=None, stepper=None):
        stepper = stepper or self.stepper
        request = request or self.request()
        report = stepper.plan_report(request)
        return stepper.apply(request, plan_sha256=report['planSha256'], confirm=report['confirm'])

    def everything_written(self):
        parts = []
        for path in self.ops.rglob('*'):
            if path.is_file():
                if 'previous' in path.parts or 'owner' in path.parts:
                    continue  # owner files and previous copies hold the real server.env by design (root/0600)
                parts.append(path.read_bytes().decode(errors='replace'))
        return '\n'.join(parts)

    # ---- plan ----------------------------------------------------------------
    def test_plan_is_read_only_and_reports_digests_not_values(self):
        before = self.snapshot()
        report = self.stepper.plan_report(self.request())
        self.assertEqual(before, self.snapshot())
        self.assertFalse(list(self.step.iterdir()))
        self.assertFalse(self.profile_dir.exists())
        self.assertEqual(report['confirm'], f"activate-service-env {report['planSha256'][:16]} generation 1")
        self.assertIn('AI_PROJECT_BUDGET_USD', report['changedKeys'])
        self.assertNotIn('STRIPE_SECRET_KEY', report['changedKeys'])
        change = report['plan']['changes']['AI_PROJECT_BUDGET_USD']
        self.assertEqual(change, {'beforeSha256': sha(b'3.34'), 'afterSha256': sha(b'45')})
        text = json.dumps(report)
        for secret in SECRETS + [AUD, OLD_USER]:
            self.assertNotIn(secret, text)
        self.assertEqual(report['plan']['changes']['CLOUDFLARE_ACCESS_AUD']['afterSha256'], sha(AUD.encode()))

    def test_plan_is_deterministic(self):
        first = self.stepper.plan_report(self.request())
        second = self.stepper.plan_report(self.request())
        self.assertEqual(first['planSha256'], second['planSha256'])

    # ---- apply -----------------------------------------------------------------
    def test_apply_replaces_files_restarts_and_activates_the_first_generation(self):
        old = self.snapshot()
        result = self.apply()
        new = self.snapshot()
        self.assertEqual(result['generation'], 1)
        self.assertEqual(new['pinned-image.json'], old['pinned-image.json'])
        values = env.parse_env(new['server.env'].decode())
        self.assertEqual(values['SERVICE_ACCESS_ENFORCEMENT'], 'true')
        self.assertEqual(values['AI_PROJECT_BUDGET_USD'], '45')
        self.assertEqual(values['CLOSED_BETA_USER_IDS'], '')
        # Untouched lines are byte-identical (secrets, billing, provider).
        old_lines = [l for l in old['server.env'].decode().splitlines()
                     if l.split('=')[0] in ('DATABASE_URL', 'OPENAI_API_KEY', 'STRIPE_SECRET_KEY',
                                            'STRIPE_WEBHOOK_SECRET', 'BILLING_ENFORCEMENT', 'PUBLIC_HOST')]
        for line in old_lines:
            self.assertIn(line, new['server.env'].decode().splitlines())
        manifest = json.loads(new['manifest.json'])
        self.assertEqual(manifest['ownerEnvironmentSha256'], sha(new['server.env']))
        self.assertEqual(manifest['effectiveComposeSha256'], sha(new['effective-compose.json']))
        self.assertEqual(manifest['imageId'], IMAGE)
        for name in ('server.env', 'effective-compose.json', 'manifest.json'):
            self.assertEqual(os.stat(self.owner / name).st_mode & 0o777, 0o600)
        record = self.stepper.profile.verify(self.profile_dir)
        profile = record['profile']
        self.assertEqual(profile['generation'], 1)
        self.assertEqual(profile['parentProfileSha256'], sha(b'parent-readback.json'))
        self.assertEqual(profile['serverEnvSha256'], sha(new['server.env']))
        self.assertEqual(profile['effectiveComposeSha256'], sha(new['effective-compose.json']))
        self.assertEqual(profile['pinnedImageSha256'], sha(new['pinned-image.json']))
        self.assertEqual(profile['sourceCommit'], COMMIT)
        self.assertEqual(profile['activation']['backupManifestSha256'], sha(b'backup-manifest.json'))
        self.assertEqual(profile['activation']['restoreProofSha256'], sha(b'restore-proof.json'))
        self.assertEqual(self.host.calls, ['restart', 'verify'])

    def test_journal_is_chained_and_records_value_digests_only(self):
        result = self.apply()
        journal = env.Journal(self.step)
        events = [r['event'] for r in journal.rows()]
        self.assertEqual(events, ['intent-persisted', 'files-replaced', 'env-applied', 'completed'])
        intent = journal.rows()[0]
        self.assertEqual(intent['changes']['AI_USER_BUDGET_USD'],
                         {'beforeSha256': sha(b'3.34'), 'afterSha256': sha(b'6')})
        self.assertIsNone(intent['changes']['GENERATION_DAILY_LIMIT']['beforeSha256'])
        self.assertEqual(journal.rows()[-1]['profileSha256'], result['profileSha256'])
        text = self.everything_written() + json.dumps(result)
        for secret in SECRETS + [AUD, OLD_USER]:
            self.assertNotIn(secret, text)

    def test_intent_and_previous_files_exist_before_the_first_file_changes(self):
        seen = {}
        original = self.host.restart

        def spy():
            seen['events'] = [r['event'] for r in env.Journal(self.step).rows()]
            operation = next(p for p in self.step.iterdir() if p.is_dir())
            seen['previous'] = {n: (operation / 'previous' / n).read_bytes() for n in env.OWNER_FILES}
            original()
        self.host.restart = spy
        old = self.snapshot()
        self.apply()
        self.assertEqual(seen['events'], ['intent-persisted', 'files-replaced'])
        self.assertEqual(seen['previous'], old)

    def test_a_second_generation_chains_to_the_first(self):
        self.apply()
        first = self.stepper.profile.verify(self.profile_dir)
        request = self.request(AI_PROJECT_BUDGET_USD='100', AI_USER_BUDGET_USD='8.5', GENERATION_DAILY_LIMIT='3',
                               AI_BUDGET_WINDOW_START='2026-12-05T00:00:00Z', AI_BUDGET_WINDOW_END='2027-01-04T00:00:00Z')
        report = self.stepper.plan_report(request)
        self.assertEqual(report['plan']['generation'], 2)
        self.assertNotIn('SERVICE_ACCESS_ENFORCEMENT', report['changedKeys'])
        self.assertTrue(report['confirm'].endswith('generation 2'))
        result = self.stepper.apply(request, plan_sha256=report['planSha256'], confirm=report['confirm'])
        self.assertEqual(result['generation'], 2)
        second = self.stepper.profile.verify(self.profile_dir)
        self.assertEqual(second['profile']['parentProfileSha256'], first['profileSha256'])

    # ---- refusals: nothing may change -------------------------------------------
    def assert_refused(self, request=None, pattern=None, **kwargs):
        before = self.snapshot()
        with self.assertRaisesRegex(env.Refusal, pattern or '.'):
            self.stepper.plan_report(request or self.request(**kwargs))
        self.assertEqual(before, self.snapshot())
        self.assertFalse(list(self.step.iterdir()))
        self.assertFalse(self.host.calls)

    def test_keys_outside_the_closed_set_are_refused(self):
        for key in ('STRIPE_SECRET_KEY', 'BILLING_ENFORCEMENT', 'BILLING_ENABLED', 'OPENAI_API_KEY', 'DATABASE_URL',
                    'ALTERWARD_TAG', 'PUBLIC_HOST', 'CLOSED_BETA_ENABLED', 'CLAUDE_PRODUCTION_BUDGET_USD',
                    'STRIPE_PRICE_ID', 'SUPABASE_SERVICE_ROLE_KEY'):
            with self.subTest(key):
                self.assert_refused(self.request(**{key: 'x'}), 'not in the allowed set')

    def test_value_rules_and_ceilings(self):
        bad = {'SERVICE_ACCESS_ENFORCEMENT': 'false', 'CLOSED_SITE_ENABLED': 'false',
               'CLOUDFLARE_ACCESS_AUD': 'XYZ', 'CLOUDFLARE_ACCESS_TEAM_DOMAIN': 'evil.example.com',
               'CLOSED_BETA_USER_IDS': OLD_USER, 'NARRATIVE_COHORT_USER_IDS': OLD_USER,
               'AI_PROJECT_BUDGET_USD': '4000', 'AI_USER_BUDGET_USD': '9', 'GENERATION_DAILY_LIMIT': '4',
               'AI_BUDGET_WINDOW_REQUIRED': 'false', 'AI_BUDGET_WINDOW_START': '2026-11-05', "AI_USER_BUDGET_USD ": '1'}
        for key, value in bad.items():
            with self.subTest(key):
                self.assert_refused(self.request(**{key: value}), 'rejected|not in the allowed set')

    def test_the_public_turnstile_site_key_may_be_set_and_reaches_only_the_web_service(self):
        key = '0x4AAAAAAAtestSiteKey0001'
        report = self.stepper.plan_report(self.request(TURNSTILE_SITE_KEY=key))
        self.assertIn('TURNSTILE_SITE_KEY', report['changedKeys'])
        self.assertIsNone(report['plan']['changes']['TURNSTILE_SITE_KEY']['beforeSha256'])
        self.stepper.apply(self.request(TURNSTILE_SITE_KEY=key), plan_sha256=report['planSha256'],
                           confirm=report['confirm'])
        self.assertEqual(self.host.running['services']['web']['environment']['TURNSTILE_SITE_KEY'], key)
        self.assertNotIn('TURNSTILE_SITE_KEY', self.host.running['services']['api']['environment'])

    def test_a_turnstile_key_the_release_compose_does_not_pass_on_is_refused(self):
        KEYS['web'].remove('TURNSTILE_SITE_KEY')
        self.addCleanup(KEYS['web'].append, 'TURNSTILE_SITE_KEY')
        self.setUp()  # rebuild the owner files from a release compose that lacks the variable
        self.assert_refused(self.request(TURNSTILE_SITE_KEY='0x4AAAAAAAtestSiteKey0001'), 'does not reach')

    def test_a_malformed_turnstile_key_is_refused(self):
        for value in ('short', 'has space in it......', "quote'quote..........."):
            with self.subTest(value):
                self.assert_refused(self.request(TURNSTILE_SITE_KEY=value), 'rejected')

    def test_user_budget_may_not_exceed_the_project_budget(self):
        self.assert_refused(self.request(AI_PROJECT_BUDGET_USD='5', AI_USER_BUDGET_USD='6'), 'ordered')

    def test_window_must_be_ordered_and_bounded(self):
        self.assert_refused(self.request(AI_BUDGET_WINDOW_END='2026-11-05T00:00:00Z'), 'window')
        self.assert_refused(self.request(AI_BUDGET_WINDOW_END='2027-03-05T00:00:00Z'), 'window')

    def test_unquoted_or_unsafe_values_are_refused(self):
        self.assert_refused(self.request(CLOUDFLARE_ACCESS_TEAM_DOMAIN="a'b.cloudflareaccess.com"), 'rejected')
        self.assert_refused(self.request(CLOUDFLARE_ACCESS_TEAM_DOMAIN="a$b.cloudflareaccess.com"), 'rejected')

    def test_request_shape_is_closed(self):
        request = self.request()
        request['extra'] = 1
        self.assert_refused(request, 'Exact request keys')
        request = self.request()
        request['sourceDirectory'] = '/tmp/elsewhere'
        self.assert_refused(request, 'paths')
        request = self.request()
        request['backupManifestPath'] = '../owner/server.env'
        self.assert_refused(request, 'paths')

    def test_billing_must_already_be_live_and_enforcing(self):
        path = self.owner / 'server.env'
        for bad in ("BILLING_ENFORCEMENT='false'", "BILLING_ENABLED='false'"):
            with self.subTest(bad):
                self.setUp()
                key = bad.split('=')[0]
                self.rewrite_owner(lambda t: t.replace(f"{key}='true'", bad))
                self.assert_refused(pattern='BILLING')

    def rewrite_owner(self, change):
        files = self.snapshot()
        text = change(files['server.env'].decode())
        config = self.host.render(text.encode(), files['pinned-image.json'], 'src')
        compose = env.frozen(config)
        manifest = json.loads(files['manifest.json'])
        manifest.update(ownerEnvironmentSha256=sha(text.encode()), effectiveComposeSha256=sha(compose))
        for name, data in {'server.env': text.encode(), 'effective-compose.json': compose,
                           'manifest.json': env.encoded(manifest)}.items():
            env._replace(self.owner / name, data)

    def test_a_placeholder_provider_key_is_refused_for_a_positive_budget(self):
        self.rewrite_owner(lambda t: t.replace(SECRETS[2], env.PLACEHOLDER_PROVIDER))
        self.assert_refused(pattern='provider key')

    def test_queued_or_running_jobs_block_the_restart(self):
        self.host.jobs = 1
        self.assert_refused(pattern='jobs')

    def test_a_foreign_running_image_or_source_is_refused(self):
        self.host.images_value['worker'] = 'sha256:' + '9' * 64
        self.assert_refused(pattern='image')
        self.setUp()
        self.host.source_digest = 'f' * 64
        self.assert_refused(pattern='source')
        self.setUp()
        request = self.request()
        request['imageId'] = 'sha256:' + '8' * 64
        self.assert_refused(request, 'image')

    def test_drifted_owner_files_are_refused(self):
        env._replace(self.owner / 'server.env', (self.owner / 'server.env').read_bytes() + b"X='1'\n")
        self.assert_refused(pattern='manifest')

    def test_rendered_configuration_may_differ_only_in_the_planned_keys(self):
        self.host.extra_env = 'SMUGGLED_FLAG'
        self.assert_refused(pattern='outside the planned keys')

    def test_a_missing_parent_or_evidence_is_refused(self):
        request = self.request()
        request['parentReadbackPath'] = None
        self.assert_refused(request, 'parent')
        request = self.request()
        request['restoreProofPath'] = 'missing.json'
        self.assert_refused(request, 'missing')

    def test_no_change_is_refused(self):
        self.apply()
        self.assert_refused_after_apply()

    def assert_refused_after_apply(self):
        with self.assertRaisesRegex(env.Refusal, 'changes nothing'):
            self.stepper.plan_report(self.request())

    def test_an_unfinished_service_operation_blocks_the_step(self):
        operator = self.stepper.operator
        journal = operator.Journal(self.state)
        journal.append('intent-persisted', 'op1', NOW)
        journal.append('apply-started', 'op1', NOW)
        self.assert_refused(pattern='Unfinished service operation')

    # ---- confirmation -------------------------------------------------------------
    def test_wrong_phrase_or_stale_plan_hash_changes_nothing(self):
        request = self.request()
        report = self.stepper.plan_report(request)
        before = self.snapshot()
        with self.assertRaisesRegex(env.Refusal, 'confirmation required'):
            self.stepper.apply(request, plan_sha256=report['planSha256'], confirm='yes')
        with self.assertRaisesRegex(env.Refusal, 'confirmation required'):
            self.stepper.apply(request, plan_sha256=report['planSha256'],
                               confirm=report['confirm'].replace('generation 1', 'generation 2'))
        with self.assertRaisesRegex(env.Refusal, 'plan changed'):
            self.stepper.apply(request, plan_sha256='0' * 64, confirm=report['confirm'])
        self.assertEqual(before, self.snapshot())
        self.assertFalse(list(self.step.iterdir()))
        self.assertFalse(self.host.calls)

    def test_the_phrase_is_bound_to_the_exact_plan(self):
        first = self.stepper.plan_report(self.request())
        second = self.stepper.plan_report(self.request(AI_USER_BUDGET_USD='5'))
        self.assertNotEqual(first['confirm'], second['confirm'])

    # ---- failure handling ---------------------------------------------------------
    def test_a_failed_restart_restores_the_previous_files_and_writes_no_profile(self):
        old = self.snapshot()
        self.host.restart_failures = 1
        with self.assertRaisesRegex(env.Refusal, 'previous files were restored'):
            self.apply()
        self.assertEqual(old, self.snapshot())
        self.assertFalse(self.profile_dir.exists())
        events = [r['event'] for r in env.Journal(self.step).rows()]
        self.assertEqual(events, ['intent-persisted', 'files-replaced', 'rolled-back'])
        self.assertEqual(env.Journal(self.step).open_operations(), [])

    def test_a_failed_verification_restores_the_previous_files(self):
        old = self.snapshot()
        self.host.verify_failures = 1
        with self.assertRaisesRegex(env.Refusal, 'previous files were restored'):
            self.apply()
        self.assertEqual(old, self.snapshot())
        self.assertFalse(self.profile_dir.exists())
        # The rollback restarted and re-verified the old configuration.
        self.assertEqual(self.host.calls, ['restart', 'verify', 'restart', 'verify'])

    def test_a_failed_rollback_is_journaled_and_blocks_new_plans(self):
        self.host.restart_failures = 2
        with self.assertRaises(env.Refusal):
            self.apply()
        events = [r['event'] for r in env.Journal(self.step).rows()]
        self.assertEqual(events[-1], 'rollback-failed')
        with self.assertRaisesRegex(env.Refusal, 'resume it first'):
            self.stepper.plan_report(self.request())
        # The previous files were put back before the failing restart.
        self.host.restart_failures = 0
        operation = env.Journal(self.step).rows()[0]['operationId']
        result = self.stepper.resume(operation)
        self.assertEqual(result['outcome'], 'rolled-back')
        self.assertEqual(env.Journal(self.step).open_operations(), [])

    def test_resume_restores_when_the_environment_was_never_proven(self):
        old = self.snapshot()

        class Interrupted(env.Stepper):
            def _rollback(self, *args):  # the helper died: no rollback ran
                return False
        stepper = Interrupted(owner_dir=self.owner, step_dir=self.step, profile_dir=self.profile_dir,
                              state_dir=self.state, host=self.host, clock=self.clock,
                              identity=lambda: ('operator', 'host'))
        self.host.restart_failures = 1
        with self.assertRaises(env.Refusal):
            self.apply(stepper=stepper)
        self.assertNotEqual(old, self.snapshot())
        operation = env.Journal(self.step).rows()[0]['operationId']
        self.assertEqual(env.Journal(self.step).state(operation), 'files-replaced')
        result = self.stepper.resume(operation)
        self.assertEqual(result['outcome'], 'rolled-back')
        self.assertEqual(old, self.snapshot())
        self.assertFalse(self.profile_dir.exists())

    def test_a_failed_profile_activation_leaves_the_env_live_and_resume_finishes_only_the_profile(self):
        real = self.stepper.profile.activate

        def broken(*args, **kwargs):
            raise self.stepper.profile.ProfileError('disk full')
        self.stepper.profile.activate = broken
        with self.assertRaisesRegex(env.Refusal, 'resume --operation-id'):
            self.apply()
        after_apply = self.snapshot()
        self.assertEqual(env.parse_env(after_apply['server.env'].decode())['SERVICE_ACCESS_ENFORCEMENT'], 'true')
        operation = env.Journal(self.step).rows()[0]['operationId']
        self.assertEqual(env.Journal(self.step).state(operation), 'env-applied')
        self.host.calls.clear()
        self.stepper.profile.activate = real
        result = self.stepper.resume(operation)
        self.assertEqual(result['generation'], 1)
        self.assertEqual(after_apply, self.snapshot())           # the env was not rewritten
        self.assertEqual(self.host.calls, ['verify'])              # and not restarted
        self.assertEqual(env.Journal(self.step).state(operation), 'completed')
        with self.assertRaisesRegex(env.Refusal, 'already ended'):
            self.stepper.resume(operation)

    def test_resume_accepts_an_already_activated_matching_profile(self):
        real = self.stepper.profile.activate
        calls = []

        def activate_then_die(*args, **kwargs):
            calls.append(1)
            real(*args, **kwargs)
            raise self.stepper.profile.ProfileError('died after the write')
        self.stepper.profile.activate = activate_then_die
        with self.assertRaises(env.Refusal):
            self.apply()
        operation = env.Journal(self.step).rows()[0]['operationId']
        self.stepper.profile.activate = real
        result = self.stepper.resume(operation)
        self.assertEqual(result['generation'], 1)
        self.assertEqual(len(calls), 1)

    def test_the_whole_session_leaves_no_secret_in_any_written_evidence(self):
        self.host.restart_failures = 1
        with self.assertRaises(env.Refusal) as caught:
            self.apply()
        self.assertFalse(any(s in str(caught.exception) for s in SECRETS))
        self.apply()
        text = self.everything_written()
        for secret in SECRETS + [AUD, OLD_USER]:
            self.assertNotIn(secret, text)


class EnvEditingTests(unittest.TestCase):
    def test_apply_env_replaces_in_place_and_appends_missing_keys(self):
        text = "# c\nA='1'\nCLOSED_SITE_ENABLED='false'\n\nZ='9'\n"
        out = env.apply_env(text, {'CLOSED_SITE_ENABLED': 'true', 'GENERATION_DAILY_LIMIT': '2'})
        self.assertEqual(out, "# c\nA='1'\nCLOSED_SITE_ENABLED='true'\n\nZ='9'\nGENERATION_DAILY_LIMIT='2'\n")

    def test_duplicate_or_malformed_lines_are_refused(self):
        with self.assertRaises(env.Refusal):
            env.parse_env("A='1'\nA='2'\n")
        with self.assertRaises(env.Refusal):
            env.parse_env('A=1\n')
        with self.assertRaises(env.Refusal):
            env.apply_env("CLOSED_SITE_ENABLED='a'\nCLOSED_SITE_ENABLED='b'\n", {'CLOSED_SITE_ENABLED': 'true'})

    def test_freezing_round_trips_dollars(self):
        config = {'services': {'api': {'environment': {'K': 'a$b'}}}}
        self.assertEqual(env.unfrozen(json.loads(env.frozen(config))), config)

    def test_the_allowed_set_has_no_secret_or_billing_key(self):
        for key in env.ALLOWED:
            self.assertFalse(any(part in key for part in ('SECRET', 'PASSWORD', 'TOKEN', 'STRIPE', 'BILLING_', 'DATABASE', 'OPENAI')),
                             key)


if __name__ == '__main__':
    unittest.main()
