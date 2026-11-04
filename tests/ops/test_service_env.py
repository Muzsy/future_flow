"""Service-env step (P2): fake host, no Docker, DB, Auth or real owner files."""
import datetime as dt
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path
import tempfile
import unittest
from unittest import mock

directory = Path(__file__).resolve().parents[2] / 'scripts/ops'
spec = importlib.util.spec_from_file_location('service_env', directory / 'contabo-service-env.py')
env = importlib.util.module_from_spec(spec)
spec.loader.exec_module(env)

NOW = dt.datetime(2026, 11, 4, 9, 0, tzinfo=dt.timezone.utc)
IMAGE = 'sha256:' + 'b' * 64
COMMIT = 'a' * 40
AUD = 'c' * 64
SECRETS = ['sk_live_FAKESECRET', 'whsec_FAKEWEBHOOK', 'sk-real-fake-provider', 'postgresql://u:FAKEPASSWORD@h/db']
PREPARED = hashlib.sha256(b'successor-prepared').hexdigest()
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
        self.render_hook = None        # mutates the rendered services (beyond-environment drift)
        self.running = None
        self.restart_failures = 0      # remaining failing restarts
        self.verify_failures = 0
        self.observed_override = {}    # what the running stack reports instead (profile check)
        self.calls = []
        self.successor = {'pending': False, 'upgradeHealthy': True, 'purpose': 'billing-config-040',
                          'stage': 'enforce', 'readbackSha256': sha(b'successor-readback'),
                          'preparedSha256': PREPARED}

    def successor_state(self):
        return dict(self.successor)

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
        if self.render_hook:
            self.render_hook(services)
        return {'services': services}

    def restart(self):
        self.calls.append('restart')
        if self.restart_failures:
            self.restart_failures -= 1
            raise env.Refusal('restart failed')
        self.running = env.unfrozen(json.loads((self.owner / 'effective-compose.json').read_bytes()))

    def verify_running(self, config, image_id):
        self.calls.append('verify')
        if self.verify_failures and 'restart' in self.calls:   # plan-time reads must pass
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
                    for s in env.SERVICES), **self.observed_override}


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
        self.write_evidence()
        self.host.running = env.unfrozen(json.loads(compose))
        self.tick = 0
        self.stepper = self.make_stepper()

    RUN = '20261104T080000Z-12345678'
    BACKUP_PATH = f'daily/backups/{RUN}/manifest.json'

    def write_evidence(self, backup=None, proof=None, funded=None):
        backup = {'runId': self.RUN, 'ownerCommit': COMMIT, 'ownerImage': IMAGE,
                  'capturedAt': '2026-11-04T08:00:00Z', **(backup or {})}
        backup_bytes = json.dumps(backup).encode()
        proof = {'backupRunId': self.RUN, 'backupManifestSha256': sha(backup_bytes), 'sourceCommit': COMMIT,
                 'fundedRuntime': {'version': 'alterward-funded-replay-2', 'schema': 40,
                                   'recoveryProfile': 'registry040', 'sourceCommit': COMMIT, 'imageId': IMAGE,
                                   'ownerManifestDigest': sha((self.owner / 'manifest.json').read_bytes()),
                                   'preparedSha256': PREPARED, **(funded or {})},
                 'tablesMatchedBeforeReplay': 103, 'reviewedTables': 102, 'reviewedForeignKeys': 226,
                 'paidAiCalls': 0, 'capturedAt': '2026-11-04T08:30:00Z',
                 **{k: True for k in env.PROOF_TRUE}, **{k: False for k in env.PROOF_FALSE}, **(proof or {})}
        for relative, data in ((self.BACKUP_PATH, backup_bytes),
                               (env.RESTORE_PROOF_PATH, json.dumps(proof).encode())):
            path = self.ops / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                path.unlink()
            env._create(path, data)

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
                'AI_BUDGET_WINDOW_START': '2026-11-05T00:00:00Z', 'AI_BUDGET_WINDOW_END': '2026-12-05T00:00:00Z',
                'TURNSTILE_SITE_KEY': '0x4AAAAAAAtestSiteKey0001'}
        base.update(values)
        return {'version': env.REQUEST_VERSION, 'imageId': IMAGE,
                'sourceDirectory': '/root/alterward-ops/release/src', 'values': base,
                'backupManifestPath': self.BACKUP_PATH, 'restoreProofPath': env.RESTORE_PROOF_PATH}

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
        self.assertEqual(profile['parentProfileSha256'], sha(b'successor-readback'))
        self.assertEqual(profile['serverEnvSha256'], sha(new['server.env']))
        self.assertEqual(profile['effectiveComposeSha256'], sha(new['effective-compose.json']))
        self.assertEqual(profile['pinnedImageSha256'], sha(new['pinned-image.json']))
        self.assertEqual(profile['sourceCommit'], COMMIT)
        self.assertEqual(profile['activation']['backupManifestSha256'], sha((self.ops / self.BACKUP_PATH).read_bytes()))
        self.assertEqual(profile['activation']['restoreProofSha256'],
                         sha((self.ops / env.RESTORE_PROOF_PATH).read_bytes()))
        self.assertEqual(self.host.calls[self.host.calls.index('restart'):], ['restart', 'verify'])

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
        # The first step rewrote the owner manifest, so the old proof no longer binds to it.
        with self.assertRaisesRegex(env.Refusal, 'not bound to the current owner manifest'):
            self.stepper.plan_report(self.request(AI_PROJECT_BUDGET_USD='100'))
        self.write_evidence()
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
        self.assertNotIn('restart', self.host.calls)

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

    def test_the_public_turnstile_site_key_is_set_and_reaches_only_the_web_service(self):
        key = '0x4AAAAAAAtestSiteKey0001'
        report = self.stepper.plan_report(self.request())
        self.assertIn('TURNSTILE_SITE_KEY', report['changedKeys'])
        self.assertIsNone(report['plan']['changes']['TURNSTILE_SITE_KEY']['beforeSha256'])
        self.apply()
        self.assertEqual(self.host.running['services']['web']['environment']['TURNSTILE_SITE_KEY'], key)
        self.assertNotIn('TURNSTILE_SITE_KEY', self.host.running['services']['api']['environment'])

    def test_the_turnstile_site_key_is_mandatory_in_the_resulting_environment(self):
        request = self.request()
        del request['values']['TURNSTILE_SITE_KEY']
        self.assert_refused(request, 'Turnstile')

    def test_a_turnstile_key_the_release_compose_does_not_pass_on_is_refused(self):
        KEYS['web'].remove('TURNSTILE_SITE_KEY')
        self.addCleanup(KEYS['web'].append, 'TURNSTILE_SITE_KEY')
        self.setUp()  # rebuild the owner files from a release compose that lacks the variable
        self.assert_refused(pattern='does not reach')

    def test_a_turnstile_key_that_only_reaches_another_service_is_refused(self):
        KEYS['web'].remove('TURNSTILE_SITE_KEY')
        KEYS['api'].append('TURNSTILE_SITE_KEY')
        self.addCleanup(KEYS['web'].append, 'TURNSTILE_SITE_KEY')
        self.addCleanup(KEYS['api'].remove, 'TURNSTILE_SITE_KEY')
        self.setUp()
        self.assert_refused(pattern='rendered web service')

    def test_the_turnstile_rule_equals_the_web_rule(self):
        # The web accepts ^[0-3]x[A-Za-z0-9_-]{15,64}$ (#161); anything else would hide the form silently.
        good = ('0x4AAAAAAAtestSiteKey0001', '1x00000000000000000000AA', '3x' + 'a' * 15, '2x' + 'Z' * 64)
        bad = ('short', 'abcdefghijklmnop', '5xAAAAAAAAAAAAAAAA', '0x' + 'a' * 14, '0x' + 'a' * 65,
               "0x4AAAAAAA'quote0001", '0x4AAAAAAA space0001', 'x04AAAAAAAAAAAAAAAA')
        for value in good:
            self.assertTrue(env.ALLOWED['TURNSTILE_SITE_KEY'](value), value)
        for value in bad:
            self.assertFalse(env.ALLOWED['TURNSTILE_SITE_KEY'](value), value)
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
        self.host.running = env.unfrozen(json.loads(compose))
        self.write_evidence()      # the proof is bound to the owner manifest digest

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

    def test_the_parent_comes_from_the_successor_chain_not_the_request(self):
        request = self.request()
        request['parentReadbackPath'] = 'owner/manifest.json'
        self.assert_refused(request, 'Exact request keys')
        for change, pattern in (({'purpose': 'schema-040'}, 'enforce'), ({'stage': 'live'}, 'enforce'),
                                ({'readbackSha256': None}, 'enforce'), ({'pending': True}, 'in progress'),
                                ({'upgradeHealthy': False}, 'in progress')):
            with self.subTest(change):
                self.host.successor.update(change)
                self.assert_refused(pattern=pattern)
                self.host.successor.update(purpose='billing-config-040', stage='enforce', pending=False,
                                           upgradeHealthy=True, readbackSha256=sha(b'successor-readback'))

    def test_evidence_paths_are_fixed_shapes(self):
        for key, value in (('backupManifestPath', '/etc/shadow'), ('backupManifestPath', '../x'),
                           ('backupManifestPath', 'daily/backups/../../owner/server.env'),
                           ('backupManifestPath', 'daily/backups/20261104T080000Z-12345678/other.json'),
                           ('backupManifestPath', 'DAILY/backups/20261104T080000Z-12345678/manifest.json'),
                           ('restoreProofPath', 'daily/status/other.json'), ('restoreProofPath', '/root/x')):
            with self.subTest(value):
                request = self.request()
                request[key] = value
                self.assert_refused(request, 'paths')

    def test_evidence_must_exist_be_real_bound_and_fresh(self):
        mutate = {
            'foreign release commit': dict(backup={'ownerCommit': 'f' * 40}),
            'foreign release image': dict(backup={'ownerImage': 'sha256:' + '1' * 64}),
            'stale backup': dict(backup={'capturedAt': '2026-11-03T05:00:00Z'}),
            'future backup': dict(backup={'capturedAt': '2026-11-04T23:00:00Z'}),
            'bad run id': dict(backup={'runId': 'x'}),
            'proof for another run': dict(proof={'backupRunId': '20261104T070000Z-aaaaaaaa'}),
            'proof not bound to the manifest': dict(proof={'backupManifestSha256': '0' * 64}),
            'stale proof': dict(proof={'capturedAt': '2026-11-04T02:00:00Z'}),
            'proof older than the backup': dict(proof={'capturedAt': '2026-11-04T07:00:00Z'}),
            'proof of another commit': dict(proof={'sourceCommit': 'e' * 40}),
            'not a native proof': dict(proof={'fundedRuntime': {'version': 'alterward-funded-replay-1', 'schema': 40,
                                                                'recoveryProfile': 'registry040', 'sourceCommit': COMMIT,
                                                                'imageId': IMAGE}}),
            'proof of another owner manifest': dict(funded={'ownerManifestDigest': '0' * 64}),
            'proof of another successor candidate': dict(funded={'preparedSha256': '1' * 64}),
            'proof without the owner manifest digest': dict(funded={'ownerManifestDigest': None}),
            'proof without the candidate digest': dict(funded={'preparedSha256': None}),
            'wrong table count': dict(proof={'tablesMatchedBeforeReplay': 101}),
            'paid calls': dict(proof={'paidAiCalls': 1}),
            'verification flag false': dict(proof={'independentReadOnlyPostReplayVerified': False}),
            'activation allowed': dict(proof={'serviceActivationAllowed': True}),
        }
        for name, change in mutate.items():
            with self.subTest(name):
                self.write_evidence(**change)
                if 'backup' in change and 'proof' not in change:
                    # keep the proof bound to the (changed) manifest so only the changed fact is under test
                    manifest = json.loads((self.ops / self.BACKUP_PATH).read_bytes())
                    proof = json.loads((self.ops / env.RESTORE_PROOF_PATH).read_bytes())
                    proof['backupManifestSha256'] = sha((self.ops / self.BACKUP_PATH).read_bytes())
                    proof['backupRunId'] = manifest['runId']
                    (self.ops / env.RESTORE_PROOF_PATH).unlink()
                    env._create(self.ops / env.RESTORE_PROOF_PATH, json.dumps(proof).encode())
                self.assert_refused(pattern='backup|proof|restore|Evidence')
        self.write_evidence()
        self.stepper.plan_report(self.request())      # the unchanged fixtures are accepted

    def test_missing_or_non_json_evidence_is_refused(self):
        (self.ops / env.RESTORE_PROOF_PATH).unlink()
        self.assert_refused(pattern='missing')
        env._create(self.ops / env.RESTORE_PROOF_PATH, b'not json')
        self.assert_refused(pattern='JSON')

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
        self.assertNotIn('restart', self.host.calls)

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
        self.assertEqual(self.host.calls[self.host.calls.index('restart'):], ['restart', 'verify', 'restart', 'verify'])

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

    # ---- review round: running state, beyond-environment drift, tamper, rollback exit ----
    def test_a_running_stack_that_differs_from_the_stored_files_is_refused(self):
        before = self.snapshot()
        for service, key, value in (('api', 'BILLING_ENFORCEMENT', 'false'), ('worker', 'AI_PROJECT_BUDGET_USD', '999'),
                                    ('web', 'CLOSED_SITE_ENABLED', 'false')):
            with self.subTest(service, key=key):
                self.setUp()
                self.host.running['services'][service]['environment'][key] = value
                with self.assertRaisesRegex(env.Refusal, 'Running services differ from the stored configuration'):
                    self.stepper.plan_report(self.request())
                self.assertEqual(before, self.snapshot())
                self.assertNotIn('restart', self.host.calls)
                self.assertFalse(list(self.step.iterdir()))

    def test_plan_still_reads_only(self):
        self.stepper.plan_report(self.request())
        self.assertEqual(self.host.calls, ['verify'])          # inspect + anonymous probe only, no restart

    def test_the_rendered_configuration_may_change_nothing_but_environment_values(self):
        hooks = {
            'command': lambda svc: svc['api'].update(command=['run', 'evil']),
            'cap_drop': lambda svc: svc['worker'].update(cap_drop=[]),
            'image': lambda svc: svc['web'].update(image='sha256:' + '7' * 64),
            'volumes': lambda svc: svc['api'].update(volumes=['/:/host:rw']),
            'ports': lambda svc: svc['web'].update(ports=['80:80']),
        }
        for name, hook in hooks.items():
            with self.subTest(name):
                self.setUp()
                self.host.render_hook = hook
                self.assert_refused(pattern='beyond the environment')

    def test_every_service_must_run_with_service_access_enforcement(self):
        self.host.render_hook = lambda svc: svc['web']['environment'].update(SERVICE_ACCESS_ENFORCEMENT='false')
        self.assert_refused(pattern='service access enforcement')

    def test_an_existing_unlisted_daily_limit_is_checked_in_the_resulting_environment(self):
        self.rewrite_owner(lambda t: t + "GENERATION_DAILY_LIMIT='10'\n")
        request = self.request()
        del request['values']['GENERATION_DAILY_LIMIT']
        self.assert_refused(request, 'daily generation limit')

    def test_tampered_previous_files_block_the_rollback_and_nothing_is_overwritten(self):
        class Interrupted(env.Stepper):
            def _rollback(self, *args):
                return False
        stepper = Interrupted(owner_dir=self.owner, step_dir=self.step, profile_dir=self.profile_dir,
                              state_dir=self.state, host=self.host, clock=self.clock,
                              identity=lambda: ('operator', 'host'))
        self.host.restart_failures = 1
        with self.assertRaises(env.Refusal):
            self.apply(stepper=stepper)
        operation = env.Journal(self.step).rows()[0]['operationId']
        previous = self.step / operation / 'previous' / 'server.env'
        previous.unlink()
        env._create(previous, b"PUBLIC_HOST='evil'\n")
        changed = self.snapshot()
        with self.assertRaisesRegex(env.Refusal, 'Rollback did not verify'):
            self.stepper.resume(operation)
        self.assertEqual(changed, self.snapshot())
        self.assertEqual(env.Journal(self.step).state(operation), 'rollback-failed')

    def test_a_profile_generation_that_already_exists_with_other_content_is_refused(self):
        real = self.stepper.profile.activate

        def broken(*args, **kwargs):
            raise self.stepper.profile.ProfileError('disk full')
        self.stepper.profile.activate = broken
        with self.assertRaises(env.Refusal):
            self.apply()
        operation = env.Journal(self.step).rows()[0]['operationId']
        plan = json.loads((self.step / operation / 'plan.json').read_bytes())
        other = {'version': self.stepper.profile.PROFILE_VERSION, 'generation': 1,
                 'parentProfileSha256': plan['parentProfileSha256'], 'sourceCommit': COMMIT, 'imageId': IMAGE,
                 'effectiveComposeSha256': plan['after']['effectiveComposeSha256'],
                 'serverEnvSha256': plan['after']['serverEnvSha256'],
                 'pinnedImageSha256': plan['after']['pinnedImageSha256'], 'schema': 40,
                 'serviceAccessEnforcement': True,
                 'activation': {'approvalSha256': '9' * 64, 'approvedAt': '2026-11-04T09:00:00.000Z',
                                'backupManifestSha256': '8' * 64, 'restoreProofSha256': '7' * 64},
                 'restoredFrom': None}
        real(self.profile_dir, other, now=NOW)
        self.stepper.profile.activate = real
        with self.assertRaisesRegex(env.Refusal, 'different service profile generation'):
            self.stepper.resume(operation)
        self.assertEqual(env.Journal(self.step).state(operation), 'env-applied')

    def test_an_applied_environment_can_be_rolled_back_with_the_owners_sentence_until_its_profile_exists(self):
        old = self.snapshot()

        def broken(*args, **kwargs):
            raise self.stepper.profile.ProfileError('disk full')
        real = self.stepper.profile.activate
        self.stepper.profile.activate = broken
        with self.assertRaises(env.Refusal):
            self.apply()
        operation = env.Journal(self.step).rows()[0]['operationId']
        with self.assertRaisesRegex(env.Refusal, 'confirmation required'):
            self.stepper.resume(operation, rollback=True)
        with self.assertRaisesRegex(env.Refusal, 'confirmation required'):
            self.stepper.resume(operation, rollback=True, confirm='rollback-service-env other')
        self.assertNotEqual(old, self.snapshot())
        result = self.stepper.resume(operation, rollback=True, confirm=f'rollback-service-env {operation}')
        self.assertEqual(result['outcome'], 'rolled-back')
        self.assertEqual(old, self.snapshot())
        self.assertFalse(self.profile_dir.exists())
        self.assertEqual(env.Journal(self.step).state(operation), 'rolled-back')
        self.stepper.profile.activate = real
        self.apply()   # a fresh generation 1 is possible afterwards

    def test_a_rollback_is_refused_once_the_profile_generation_exists_or_outside_applied(self):
        self.apply()
        operation = env.Journal(self.step).rows()[0]['operationId']
        with self.assertRaisesRegex(env.Refusal, 'already ended'):
            self.stepper.resume(operation, rollback=True, confirm=f'rollback-service-env {operation}')

    def test_rollback_flag_does_not_apply_to_other_states(self):
        class Interrupted(env.Stepper):
            def _rollback(self, *args):
                return False
        stepper = Interrupted(owner_dir=self.owner, step_dir=self.step, profile_dir=self.profile_dir,
                              state_dir=self.state, host=self.host, clock=self.clock,
                              identity=lambda: ('operator', 'host'))
        self.host.restart_failures = 1
        with self.assertRaises(env.Refusal):
            self.apply(stepper=stepper)
        operation = env.Journal(self.step).rows()[0]['operationId']
        with self.assertRaisesRegex(env.Refusal, 'only applies to an applied environment'):
            self.stepper.resume(operation, rollback=True, confirm=f'rollback-service-env {operation}')

    def test_a_running_stack_that_does_not_match_the_new_profile_gets_no_profile_record(self):
        self.host.observed_override = {'images': {s: 'sha256:' + '9' * 64 for s in env.SERVICES}}
        with self.assertRaisesRegex(env.Refusal, 'does not match the service profile to be activated'):
            self.apply()
        self.assertFalse(self.profile_dir.exists())              # the record is not written first
        operation = env.Journal(self.step).rows()[0]['operationId']
        self.assertEqual(env.Journal(self.step).state(operation), 'env-applied')
        self.host.observed_override = {}
        self.assertEqual(self.stepper.resume(operation)['generation'], 1)

    def test_a_rollback_is_refused_once_the_profile_record_exists_even_if_the_journal_lags(self):
        real = self.stepper.profile.activate

        def activate_then_die(*args, **kwargs):
            real(*args, **kwargs)
            raise self.stepper.profile.ProfileError('died after the write')
        self.stepper.profile.activate = activate_then_die
        with self.assertRaises(env.Refusal):
            self.apply()
        operation = env.Journal(self.step).rows()[0]['operationId']
        self.assertEqual(env.Journal(self.step).state(operation), 'env-applied')
        after_apply = self.snapshot()
        self.host.calls.clear()
        with self.assertRaisesRegex(env.Refusal, 'generation already exists'):
            self.stepper.resume(operation, rollback=True, confirm=f'rollback-service-env {operation}')
        self.assertEqual(after_apply, self.snapshot())           # nothing was restored
        self.assertNotIn('restart', self.host.calls)
        self.assertEqual(env.Journal(self.step).state(operation), 'env-applied')

    def test_a_rollback_that_does_not_verify_says_so_and_is_journaled(self):
        def broken(*args, **kwargs):
            raise self.stepper.profile.ProfileError('disk full')
        self.stepper.profile.activate = broken
        with self.assertRaises(env.Refusal):
            self.apply()
        operation = env.Journal(self.step).rows()[0]['operationId']
        self.host.restart_failures = 1
        with self.assertRaisesRegex(env.Refusal, 'Rollback did not verify: service left as is; emergency stop'):
            self.stepper.resume(operation, rollback=True, confirm=f'rollback-service-env {operation}')
        self.assertEqual(env.Journal(self.step).state(operation), 'rollback-failed')
        self.assertFalse(self.profile_dir.exists())

    def test_the_journal_chain_is_verified(self):
        self.apply()
        path = self.step / 'journal.jsonl'
        rows = path.read_bytes().splitlines()
        row = json.loads(rows[1])
        row['previousSha256'] = '1' * 64
        body = {k: v for k, v in row.items() if k != 'sha256'}
        row['sha256'] = sha(env.canonical(body))
        rows[1] = env.canonical(row).rstrip(b'\n')
        os.chmod(path, 0o600)
        path.write_bytes(b'\n'.join(rows) + b'\n')
        with self.assertRaisesRegex(env.Refusal, 'chain broken'):
            env.Journal(self.step).rows()

    def test_the_queue_probe_covers_every_table_the_daily_probe_counts(self):
        text = (directory / 'contabo-daily.py').read_text()
        tables = re.findall(r"'((?:ff|aw)_[a-z_]+)'", text[text.index('PERSONAL_QUEUE_PROBE'):text.index('DATABASE_PROBE')])
        wanted = {t for t in tables if t.endswith(('_jobs', '_reviews'))}
        self.assertTrue({'ff_jobs', 'aw_scenario_reviews', 'aw_shared_jobs'} <= wanted)
        for table in wanted | {'aw_jobs'}:
            self.assertIn(f"'{table}'", env.HostRuntime.QUEUE_PROBE, table)



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


DAILY_BACKUP_LIB = "MARK = 'backup-lib'\n"
DAILY_SCRIPT = """import alterward_backup as backup  # as the real Daily: needs the registered library
import json

def config():
    if backup.MARK != 'backup-lib':
        raise ValueError('library missing')

def regular(path):
    return path.read_bytes()

def funded_upgrade_healthy(mode):
    return mode == 'personal-beta'

def successor_roots():
    return []
"""


@unittest.skipIf(os.name != 'posix', 'POSIX permission, ownership and lock checks')
class DailyLoadingTests(unittest.TestCase):
    """Daily is loaded the way its own entry does, and only by the paths that read the successor chain."""

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.scripts = self.root / 'daily/scripts'
        self.scripts.mkdir(parents=True)
        (self.scripts / 'backup_lib.py').write_text(DAILY_BACKUP_LIB)
        (self.scripts / 'contabo-daily.py').write_text(DAILY_SCRIPT)
        for name in ('alterward_backup', 'alterward_daily'):
            saved = sys.modules.pop(name, None)
            self.addCleanup(lambda n=name, m=saved: sys.modules.pop(n, None) if m is None
                            else sys.modules.__setitem__(n, m))

    def test_the_loader_registers_the_backup_library_before_daily(self):
        daily = env.load_daily(self.scripts)
        self.assertIs(sys.modules['alterward_daily'], daily)
        self.assertEqual(sys.modules['alterward_backup'].MARK, 'backup-lib')

    def test_a_daily_that_fails_its_own_check_is_refused_not_trusted(self):
        (self.scripts / 'backup_lib.py').write_text("MARK = 'tampered'\n")
        with self.assertRaises(ValueError):
            env.load_daily(self.scripts)

    def test_the_successor_state_loads_daily_lazily_and_reads_it(self):
        loads = []
        host = env.HostRuntime(daily_loader=lambda: loads.append(1) or env.load_daily(self.scripts))
        self.assertEqual(loads, [])                       # construction never loads Daily
        state = host.successor_state()
        self.assertEqual(state, {'pending': False, 'upgradeHealthy': True, 'purpose': None, 'stage': None,
                                 'readbackSha256': None, 'preparedSha256': None})
        host.successor_state()
        self.assertEqual(loads, [1])                      # and a second read reuses it

    def test_an_unloadable_daily_is_a_value_free_refusal(self):
        (self.scripts / 'contabo-daily.py').unlink()
        host = env.HostRuntime(daily_loader=lambda: env.load_daily(self.scripts))
        with self.assertRaisesRegex(env.Refusal, 'successor chain could not be read'):
            host.successor_state()

    def test_building_the_step_does_not_load_daily_and_the_default_directory_is_the_installed_one(self):
        self.assertEqual(env.DAILY_SCRIPTS, Path('/root/alterward-ops/daily/scripts'))
        state, step = self.root / 'state', self.root / 'step'
        loads = []
        with mock.patch.object(env, 'STATE_DIR', state), mock.patch.object(env, 'STEP_DIR', step), \
                mock.patch.object(env, 'load_daily', lambda *a: loads.append(1)):
            operator, stepper = env.build_stepper()
            self.assertIsNone(stepper.host._daily)
            self.assertEqual(loads, [])
            self.assertTrue(callable(operator.operation_lock))


if __name__ == '__main__':
    unittest.main()
