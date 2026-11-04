"""Daily's service-profile runtime policy and backup catalog for the service-env step (P2)."""
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
daily = load('daily_for_service_env', 'contabo-daily.py')
step = load('service_env_for_daily', 'contabo-service-env.py')
NOW = dt.datetime(2026, 11, 10, 12, 0, tzinfo=dt.timezone.utc)
OPERATION = '123e4567-e89b-42d3-a456-426614174000'


def environments(**overrides):
    shared = {'SERVICE_ACCESS_ENFORCEMENT': 'true'}
    worker_api = {'SHARED_CONTEXTS_ENABLED': 'false', 'SHARED_FRIEND_ENABLED': 'false',
                  'SHARED_CONNECTED_ENABLED': 'false', 'SHARED_WORLD_ENABLED': 'false',
                  'CLOSED_BETA_USER_IDS': '', 'NARRATIVE_COHORT_USER_IDS': '',
                  'BILLING_ENABLED': 'true', 'BILLING_ENFORCEMENT': 'true',
                  'AI_PROJECT_BUDGET_USD': '45', 'AI_USER_BUDGET_USD': '6',
                  'NARRATIVE_PIPELINE_MODE': 'narrative-fiction-v2', 'NARRATIVE_FICTION_GENERATION': 'v9',
                  'AI_BUDGET_WINDOW_REQUIRED': 'true'}
    value = {
        'web': {**shared, 'CLOSED_SITE_ENABLED': 'true', 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'false'},
        'api': {**shared, **worker_api, 'CLOSED_SITE_ENABLED': 'true', 'GENERATION_DAILY_LIMIT': '2'},
        'worker': {**shared, **worker_api, 'OPENAI_API_KEY': 'sk-test-not-a-secret',
                   'AI_BUDGET_WINDOW_START': '2026-11-05T00:00:00Z', 'AI_BUDGET_WINDOW_END': '2026-12-05T00:00:00Z'},
    }
    for path, replacement in overrides.items():
        service, key = path.split('.')
        if replacement is None:
            value[service].pop(key, None)
        else:
            value[service][key] = replacement
    return value


def both(key, value):
    return {f'api.{key}': value, f'worker.{key}': value}


class ServiceRuntimePolicyTests(unittest.TestCase):
    def test_the_approved_first_wave_is_accepted_and_uses_the_registry(self):
        policy = daily.personal_runtime_policy(environments(), NOW)
        self.assertEqual(policy, {'mode': 'service', 'queueAllowed': True, 'userIds': [], 'serviceAdmission': True})

    def test_the_queue_is_allowed_only_inside_the_window(self):
        later = dt.datetime(2026, 12, 6, tzinfo=dt.timezone.utc)
        self.assertFalse(daily.personal_runtime_policy(environments(), later)['queueAllowed'])

    def test_later_wave_ceilings_are_accepted(self):
        overrides = {**both('AI_PROJECT_BUDGET_USD', '100'), **both('AI_USER_BUDGET_USD', '8.5'),
                     'api.GENERATION_DAILY_LIMIT': '3'}
        self.assertEqual(daily.personal_runtime_policy(environments(**overrides), NOW)['mode'], 'service')

    def test_each_violation_is_refused(self):
        cases = {
            'project over the ceiling': both('AI_PROJECT_BUDGET_USD', '101'),
            'user over the ceiling': both('AI_USER_BUDGET_USD', '9'),
            'user above project': {**both('AI_PROJECT_BUDGET_USD', '5'), **both('AI_USER_BUDGET_USD', '6')},
            'zero budget': {**both('AI_PROJECT_BUDGET_USD', '0'), **both('AI_USER_BUDGET_USD', '0')},
            'api worker budget mismatch': {'api.AI_PROJECT_BUDGET_USD': '10'},
            'daily limit': {'api.GENERATION_DAILY_LIMIT': '4'},
            'beta list': {'api.CLOSED_BETA_USER_IDS': '11111111-1111-4111-8111-111111111111',
                          'worker.CLOSED_BETA_USER_IDS': '11111111-1111-4111-8111-111111111111'},
            'cohort list': both('NARRATIVE_COHORT_USER_IDS', '11111111-1111-4111-8111-111111111111'),
            'billing not enforced': both('BILLING_ENFORCEMENT', 'false'),
            'billing off': both('BILLING_ENABLED', 'false'),
            'legacy narrative': both('NARRATIVE_FICTION_GENERATION', 'v8'),
            'window missing': {'worker.AI_BUDGET_WINDOW_START': None},
            'window too long': {'worker.AI_BUDGET_WINDOW_END': '2027-03-05T00:00:00Z'},
            'window reversed': {'worker.AI_BUDGET_WINDOW_END': '2026-11-04T00:00:00Z'},
            'window not required': both('AI_BUDGET_WINDOW_REQUIRED', 'false'),
            'placeholder provider': {'worker.OPENAI_API_KEY': 'alterward_owner_provider_access_disabled'},
            'claude key': {'worker.ANTHROPIC_API_KEY': 'x'},
            'provider on api': {'api.OPENAI_API_KEY': 'x'},
            'open site gate off': {'web.CLOSED_SITE_ENABLED': 'false'},
            'shared on': {'worker.SHARED_WORLD_ENABLED': 'true'},
            'exposure on': {'web.PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'true'},
            'mixed enforcement': {'web.SERVICE_ACCESS_ENFORCEMENT': 'false'},
            'bad flag': {'web.SERVICE_ACCESS_ENFORCEMENT': 'True'},
        }
        for name, overrides in cases.items():
            with self.subTest(name), self.assertRaises(ValueError):
                daily.personal_runtime_policy(environments(**overrides), NOW)

    def test_the_three_services_must_agree_on_service_access_enforcement(self):
        for mixed in ({'web': 'false', 'api': 'true', 'worker': 'true'}, {'web': 'true', 'api': 'false', 'worker': 'true'},
                      {'web': 'true', 'api': 'true', 'worker': 'false'}):
            with self.subTest(mixed), self.assertRaisesRegex(ValueError, 'disagree'):
                daily.service_profile_enforced({n: {'SERVICE_ACCESS_ENFORCEMENT': v} for n, v in mixed.items()})
        self.assertTrue(daily.service_profile_enforced({n: {'SERVICE_ACCESS_ENFORCEMENT': 'true'} for n in ('web', 'api', 'worker')}))
        self.assertFalse(daily.service_profile_enforced({n: {} for n in ('web', 'api', 'worker')}))
        with self.assertRaises(ValueError):
            daily.service_profile_enforced({n: {'SERVICE_ACCESS_ENFORCEMENT': 'yes'} for n in ('web', 'api', 'worker')})

    def test_the_legacy_beta_and_owner_matrices_are_unchanged_when_enforcement_is_off(self):
        owner = {name: {'SERVICE_ACCESS_ENFORCEMENT': 'false'} for name in ('web', 'api', 'worker')}
        with self.assertRaises(ValueError):          # the old matrix still demands the closed origin etc.
            daily.personal_runtime_policy(owner, NOW)
        absent = {name: {} for name in ('web', 'api', 'worker')}
        with self.assertRaises(ValueError):
            daily.personal_runtime_policy(absent, NOW)

    def test_ceilings_match_the_root_step(self):
        self.assertEqual(daily.SERVICE_MAX_PROJECT_USD, step.MAX_PROJECT_USD)
        self.assertEqual(daily.SERVICE_MAX_USER_USD, step.MAX_USER_USD)
        self.assertEqual(daily.SERVICE_MAX_DAILY_LIMIT, step.MAX_DAILY_LIMIT)
        self.assertEqual(daily.SERVICE_MAX_WINDOW_DAYS, step.MAX_WINDOW_DAYS)
        self.assertEqual(daily.SERVICE_ENV_JOURNAL_VERSION, step.JOURNAL_VERSION)
        self.assertEqual(daily.SERVICE_ENV_PREVIOUS_NAMES, set(step.OWNER_FILES))

    def test_what_the_step_may_set_always_satisfies_the_policy_ceilings(self):
        top = {**both('AI_PROJECT_BUDGET_USD', str(step.MAX_PROJECT_USD)),
               **both('AI_USER_BUDGET_USD', str(step.MAX_USER_USD)),
               'api.GENERATION_DAILY_LIMIT': str(step.MAX_DAILY_LIMIT),
               'worker.AI_BUDGET_WINDOW_END': '2026-12-06T00:00:00Z'}
        self.assertEqual(daily.personal_runtime_policy(environments(**top), NOW)['mode'], 'service')


@unittest.skipIf(os.name != 'posix', 'POSIX permission and ownership checks')
class ServiceEnvCatalogTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        root = Path(self.temporary.name)
        self.env_dir = root / 'service-env'
        for patcher in (patch.object(daily, 'SERVICE_ENV_DIR', self.env_dir),
                        patch.object(daily, 'SERVICE_PROFILE_DIR', root / 'service-profile'),
                        patch.object(daily, 'SERVICE_OPERATION_DIR', root / 'service-operations'),
                        patch.object(daily, 'UID', os.geteuid())):
            patcher.start()
            self.addCleanup(patcher.stop)

    def build(self, operation=OPERATION):
        self.env_dir.mkdir(mode=0o700, exist_ok=True)
        os.chmod(self.env_dir, 0o700)
        (self.env_dir / 'journal.jsonl').write_bytes(b'')
        os.chmod(self.env_dir / 'journal.jsonl', 0o600)
        folder = self.env_dir / operation
        (folder / 'previous').mkdir(mode=0o700, parents=True)
        os.chmod(folder, 0o700)
        os.chmod(folder / 'previous', 0o700)
        (folder / 'plan.json').write_bytes(b'{}')
        os.chmod(folder / 'plan.json', 0o600)
        for name in step.OWNER_FILES:
            (folder / 'previous' / name).write_bytes(b'x')
            os.chmod(folder / 'previous' / name, 0o600)
        return folder

    def test_catalog_is_empty_before_first_use(self):
        self.assertEqual(daily.service_config_paths(), [])

    def test_catalog_lists_exactly_the_step_evidence(self):
        folder = self.build()
        names = sorted(p.relative_to(self.env_dir).as_posix() for p in daily.service_config_paths())
        expected = sorted(['journal.jsonl', f'{OPERATION}/plan.json'] +
                          [f'{OPERATION}/previous/{n}' for n in step.OWNER_FILES])
        self.assertEqual(names, expected)
        self.assertTrue(folder.exists())

    def test_catalog_fails_closed_on_unknown_or_public_evidence(self):
        folder = self.build()
        (folder / 'stray.txt').write_bytes(b'x')
        os.chmod(folder / 'stray.txt', 0o600)
        with self.assertRaises(ValueError):
            daily.service_config_paths()
        (folder / 'stray.txt').unlink()
        (folder / 'previous' / 'extra.env').write_bytes(b'x')
        os.chmod(folder / 'previous' / 'extra.env', 0o600)
        with self.assertRaises(ValueError):
            daily.service_config_paths()
        (folder / 'previous' / 'extra.env').unlink()
        os.chmod(folder / 'previous' / 'server.env', 0o644)
        with self.assertRaises(ValueError):
            daily.service_config_paths()
        os.chmod(folder / 'previous' / 'server.env', 0o600)
        os.chmod(folder, 0o755)
        with self.assertRaises(ValueError):
            daily.service_config_paths()
        os.chmod(folder, 0o700)
        (self.env_dir / 'notes.txt').write_bytes(b'x')
        with self.assertRaises(ValueError):
            daily.service_config_paths()

    def test_step_directory_names_follow_the_catalog_naming(self):
        self.assertRegex(OPERATION, daily.SERVICE_OPERATION_ID.pattern)


if __name__ == '__main__':
    unittest.main()
