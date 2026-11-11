"""Synthetic configurations only; no admissions, keys, windows or server writes."""
import datetime as dt
import unittest
from test_contabo_daily import daily

NOW = dt.datetime(2026, 10, 11, 10, 0, tzinfo=dt.timezone.utc)
USER = '11111111-1111-4111-8111-111111111111'


class PersonalBetaPolicyTests(unittest.TestCase):
    def inactive(self):
        common = {'CLOSED_BETA_ENABLED': 'true', 'CLOSED_BETA_USER_IDS': '',
                  'AI_PROJECT_BUDGET_USD': '0', 'AI_USER_BUDGET_USD': '0',
                  **{k: 'false' for k in daily.SHARED_FLAGS}}
        return {'web': {'CLOSED_SITE_ENABLED': 'true', 'PUBLIC_EXTERNAL_EXPOSURE_ENABLED': 'false'},
                'api': {**common, 'CLOSED_SITE_ENABLED': 'true'},
                'worker': {**common, 'AI_BUDGET_WINDOW_REQUIRED': 'true',
                           'AI_BUDGET_WINDOW_START': '', 'AI_BUDGET_WINDOW_END': '',
                           'OPENAI_API_KEY': 'alterward_owner_provider_access_disabled'}}

    def beta(self):
        env = self.inactive()
        for service in ('api', 'worker'):
            env[service].update(CLOSED_BETA_USER_IDS=USER, AI_PROJECT_BUDGET_USD='2', AI_USER_BUDGET_USD='0.5')
        env['worker'].update(OPENAI_API_KEY='synthetic_unused',
            AI_BUDGET_WINDOW_START=NOW.isoformat().replace('+00:00', 'Z'),
            AI_BUDGET_WINDOW_END=(NOW + dt.timedelta(days=30)).isoformat().replace('+00:00', 'Z'))
        return env

    def test_owner_is_inactive_and_personal_beta_has_a_fixed_nonrenewing_window(self):
        self.assertEqual(daily.personal_runtime_policy(self.inactive(), NOW),
                         {'mode': 'owner', 'queueAllowed': False, 'userIds': []})
        self.assertEqual(daily.personal_runtime_policy(self.beta(), NOW),
                         {'mode': 'personal-beta', 'queueAllowed': True, 'userIds': [USER]})
        self.assertFalse(daily.personal_runtime_policy(self.beta(), NOW + dt.timedelta(days=30))['queueAllowed'])
        self.assertFalse(daily.personal_runtime_policy(self.beta(), NOW - dt.timedelta(seconds=1))['queueAllowed'])
        raised = self.beta()
        for service in ('api', 'worker'):
            raised[service].update(AI_PROJECT_BUDGET_USD='10', AI_USER_BUDGET_USD='3.34')
        self.assertTrue(daily.personal_runtime_policy(raised, NOW)['queueAllowed'])
        for key, value in (('AI_PROJECT_BUDGET_USD', '10.01'), ('AI_USER_BUDGET_USD', '3.35')):
            over = self.beta()
            for service in ('api', 'worker'):
                over[service][key] = value
            with self.assertRaises(ValueError):
                daily.personal_runtime_policy(over, NOW)

    def test_caps_shared_invalid_admission_and_provider_placement_refuse(self):
        cases = [('api', 'OPENAI_API_KEY', 'synthetic_unused'), ('web', 'ANTHROPIC_API_KEY', 'synthetic_unused'),
                 ('worker', 'AI_PROJECT_BUDGET_USD', '10.01'), ('worker', 'AI_USER_BUDGET_USD', '3.35'),
                 ('worker', 'CLOSED_BETA_USER_IDS', USER + ',' + USER), ('worker', 'SHARED_CONTEXTS_ENABLED', 'true'),
                 ('worker', 'AI_BUDGET_WINDOW_END', (NOW + dt.timedelta(days=31)).isoformat().replace('+00:00', 'Z')),
                 ('worker', 'AI_PROJECT_BUDGET_USD', 'NaN'), ('worker', 'AI_PROJECT_INITIAL_SPENT_USD', '1'),
                 ('worker', 'ANTHROPIC_API_KEY', 'synthetic_unused'), ('worker', 'AI_BUDGET_WINDOW_REQUIRED', 'false')]
        for service, key, value in cases:
            with self.subTest(service=service, key=key):
                env = self.beta(); env[service][key] = value
                with self.assertRaises(ValueError):
                    daily.personal_runtime_policy(env, NOW)
        env = self.beta()
        for service in ('api', 'worker'):
            env[service]['CLOSED_BETA_USER_IDS'] = ','.join(f'{i:08x}-1111-4111-8111-111111111111' for i in range(10))
        self.assertEqual(len(daily.personal_runtime_policy(env, NOW)['userIds']), 10)
        for service in ('api', 'worker'):
            env[service]['CLOSED_BETA_USER_IDS'] += ',11111112-1111-4111-8111-111111111111'
        with self.assertRaises(ValueError):
            daily.personal_runtime_policy(env, NOW)

    def test_v9_configuration_is_consistent_bounded_and_admitted_without_renewing_terms(self):
        env = self.beta()
        for role in ('api', 'worker'):
            env[role].update(NARRATIVE_PIPELINE_MODE='narrative-fiction-v2',
                             NARRATIVE_FICTION_GENERATION='v9', NARRATIVE_COHORT_USER_IDS=USER)
        env['worker'].update(AI_FICTION_TIMEOUT_MS='300000', AI_FICTION_MAX_REQUEST_BYTES='131072')
        self.assertTrue(daily.personal_runtime_policy(env, NOW)['queueAllowed'])
        self.assertFalse(daily.personal_runtime_policy(env, NOW + dt.timedelta(days=30))['queueAllowed'])
        import copy
        for role, key, value in [('api','NARRATIVE_FICTION_GENERATION','v8'),
                                 ('worker','AI_FICTION_TIMEOUT_MS','300001'),
                                 ('worker','AI_FICTION_MAX_REQUEST_BYTES','196609')]:
            changed = copy.deepcopy(env); changed[role][key] = value
            with self.assertRaises(ValueError): daily.personal_runtime_policy(changed, NOW)
        for key, value in [('NARRATIVE_COHORT_USER_IDS','00000000-0000-4000-8000-000000000002'),
                           ('NARRATIVE_COHORT_USER_IDS',USER+','+USER), ('NARRATIVE_PIPELINE_MODE','legacy'),
                           ('NARRATIVE_FICTION_GENERATION','v10')]:
            changed = copy.deepcopy(env)
            for role in ('api','worker'): changed[role][key] = value
            with self.assertRaises(ValueError): daily.personal_runtime_policy(changed, NOW)

    def test_normal_beta_queue_does_not_alarm_but_unhealthy_queue_does(self):
        from test_contabo_daily import MonitorTests
        health = {**MonitorTests().healthy(), 'lastBackupAt': NOW.isoformat(), 'runtimeMode': 'personal-beta', 'pendingJobs': 1, 'queueHealthy': True}
        self.assertEqual(daily.alerts_for(health, NOW), [])
        self.assertEqual(daily.alerts_for({**health, 'queueHealthy': False}, NOW), ['personal_queue_unhealthy'])


if __name__ == '__main__':
    unittest.main()
