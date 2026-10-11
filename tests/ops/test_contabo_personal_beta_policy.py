import datetime as dt
from copy import deepcopy
import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'scripts/ops' / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


load('alterward_backup', 'contabo-backup.py')
target = load('alterward_target', 'contabo-target.py')
load('alterward_daily', 'contabo-daily.py')
policy = load('personal_beta_policy', 'contabo-personal-beta-policy.py')
NOW = dt.datetime(2026, 10, 11, 12, tzinfo=dt.timezone.utc)


class PersonalCandidateTests(unittest.TestCase):
    def setUp(self):
        self.flags = target.owner_overlay((ROOT / 'deploy/closed-site-owner.flags.env').read_text())
        self.access = {'teamDomain': 'fixture.cloudflareaccess.com', 'audience': 'a' * 64,
                       'allowedEmails': ['owner@example.invalid']}
        gate = {'CLOSED_SITE_ENABLED': 'true', 'CLOUDFLARE_ACCESS_TEAM_DOMAIN': self.access['teamDomain'],
                'CLOUDFLARE_ACCESS_AUD': self.access['audience'],
                'CLOSED_SITE_ALLOWED_EMAILS': 'owner@example.invalid'}
        env = {key: value for key, value in self.flags.items()
               if not key.endswith('_OPERATOR_ENABLED') and key not in ('CLOSED_SITE_ENABLED', 'CLAUDE_PRODUCTION_BUDGET_USD')}
        api = {**env, **gate}
        for key in list(api):
            if key.startswith('AI_BUDGET_WINDOW_'):
                del api[key]
        self.config = {'networks': {'fixture': {'internal': True}}, 'services': {
            'web': {'image': 'sha256:' + 'b' * 64, 'environment': {**gate, 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'false'}},
            'api': {'image': 'sha256:' + 'b' * 64, 'environment': api},
            'worker': {'image': 'sha256:' + 'b' * 64, 'environment': {**env, 'OPENAI_API_KEY': policy.SENTINEL}}}}
        self.request = {'participants': [{'email': 'tester@example.invalid', 'userId': '11111111-1111-4111-8111-111111111111'}],
                        'openaiKey': 'synthetic_provider_unused', 'projectUsd': '2', 'userUsd': '0.5',
                        'startsAt': '2026-10-11T12:00:00Z', 'endsAt': '2026-11-10T12:00:00Z'}

    def candidate(self, request=None, config=None, count=0):
        return policy.candidate(config or self.config, self.access, self.flags,
                                request or self.request, now=NOW, prior_window_count=count)

    def test_candidate_preserves_baseline_and_original_restore_is_exact(self):
        before = deepcopy(self.config)
        value, access = self.candidate()
        self.assertEqual(self.config, before)
        self.assertEqual(len(access['allowedEmails']), 2)
        self.assertNotIn('OPENAI_API_KEY', value['services']['web']['environment'])
        self.assertNotIn('OPENAI_API_KEY', value['services']['api']['environment'])
        self.assertEqual(policy.deactivation(self.config, self.access, self.flags, self.request, value,
                                             prepared_at=NOW), (self.config, self.access))
        summary = policy.validate_candidate(self.config, self.access, self.flags, self.request, value,
                                             now=NOW, prior_window_count=0)
        self.assertNotIn('tester', str(summary))
        self.assertNotIn(self.request['openaiKey'], str(summary))

    def test_root_observed_previous_window_count_blocks_every_fresh_activation(self):
        for count in (1, -1, True, None, '0'):
            with self.subTest(count=count), self.assertRaises(ValueError):
                self.candidate(count=count)

    def test_bound_identity_list_and_exact_request_reject_bad_inputs(self):
        cases = []
        for patch in ({'participants': []}, {'participants': self.request['participants'] * 11},
                      {'projectUsd': '2.000001'}, {'userUsd': '0.500001'}, {'projectUsd': 'NaN'},
                      {'projectUsd': 2}, {'projectUsd': '0'}, {'openaiKey': policy.SENTINEL},
                      {'openaiKey': 'key\nwith_newline'}, {'extra': True},
                      {'endsAt': '2026-11-11T12:00:00Z'}, {'startsAt': '2026-10-11T12:16:00Z'},
                      {'startsAt': '2026-02-30T12:00:00Z'}):
            cases.append({**self.request, **patch})
        for field, value in [('email', 'Tester@example.invalid'), ('email', 'bad\n@example.invalid'),
                             ('userId', 'uninvited'), ('userId', '11111111-1111-4111-1111-111111111111')]:
            cases.append({**self.request, 'participants': [{**self.request['participants'][0], field: value}]})
        for field, value in [('email', 'second@example.invalid'),
                             ('userId', '22222222-2222-4222-8222-222222222222')]:
            cases.append({**self.request, 'participants': [self.request['participants'][0],
                          {**self.request['participants'][0], field: value}]})
        for request in cases:
            with self.subTest(fields=set(request)), self.assertRaises(ValueError):
                self.candidate(request=request)

    def test_ten_identities_plus_owner_and_owner_as_participant_are_bounded(self):
        request = {**self.request, 'participants': [
            {'email': f'tester{n}@example.invalid', 'userId': f'{n:08x}-1111-4111-8111-111111111111'} for n in range(10)]}
        _, access = self.candidate(request=request)
        self.assertEqual(len(access['allowedEmails']), 11)
        request['participants'][0]['email'] = 'owner@example.invalid'
        _, access = self.candidate(request=request)
        self.assertEqual(len(access['allowedEmails']), 10)

    def test_any_other_render_delta_and_rollback_drift_is_rejected(self):
        value, _ = self.candidate()
        for service, key, changed in [('api', 'CLOSED_SITE_ENABLED', 'false'),
                                      ('web', 'OPENAI_API_KEY', 'synthetic_provider_unused'),
                                      ('api', 'CLOUDFLARE_ACCESS_AUD', 'c' * 64),
                                      ('api', 'SHARED_CONTEXTS_ENABLED', 'true'),
                                      ('worker', 'AI_PROJECT_BUDGET_USD', '1'),
                                      ('api', 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED', 'true')]:
            changed_value = deepcopy(value)
            changed_value['services'][service]['environment'][key] = changed
            with self.subTest(key=key), self.assertRaises(ValueError):
                policy.deactivation(self.config, self.access, self.flags, self.request, changed_value, prepared_at=NOW)
        for mutate in (lambda x: x['services']['api'].update(image='sha256:' + 'c' * 64),
                       lambda x: x['services']['worker'].update(ports=['1234:1234']),
                       lambda x: x['networks']['fixture'].update(internal=False)):
            changed_value = deepcopy(value)
            mutate(changed_value)
            with self.assertRaises(ValueError):
                policy.validate_candidate(self.config, self.access, self.flags, self.request, changed_value,
                                          now=NOW, prior_window_count=0)

    def test_already_funded_or_open_baseline_cannot_be_used(self):
        for service, key, value in [('api', 'CLOSED_BETA_USER_IDS', self.request['participants'][0]['userId']),
                                    ('worker', 'OPENAI_API_KEY', self.request['openaiKey']),
                                    ('api', 'SHARED_FRIEND_ENABLED', 'true'),
                                    ('web', 'CLOSED_SITE_ENABLED', 'false')]:
            changed = deepcopy(self.config)
            changed['services'][service]['environment'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.candidate(config=changed)


if __name__ == '__main__':
    unittest.main()
