"""Chained generations at the root adapter, with Docker/DB boundary substitutes.

Adapter regression tests, NOT the Linux/root/PostgreSQL acceptance.
"""
import copy
import datetime as dt
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import test_beta_successor_authority as authority
import test_beta_successor_chain as chained
import test_beta_successor_transition as sequencing
from test_funded_upgrade import funded, load

sys.modules['alterward_funded_upgrade'] = funded
sys.modules['alterward_successor_transition'] = sequencing.module
root = load('test_successor_chain_root', 'contabo-beta-successor.py')
daily = authority.daily


class ChainRootBase(unittest.TestCase):
    def setUp(self):
        self.chain = chained.Chain(self)
        self.fixture = self.chain.fixture
        for module in (root, funded):
            p = patch.object(module, 'DIRECTORY', self.fixture.owner)
            p.start()
            self.addCleanup(p.stop)
        p = patch.object(funded.fence, 'original', side_effect=authority.test_read)
        p.start()
        self.addCleanup(p.stop)

    def system(self, mode='prepare', **request):
        request = {'mode': mode, 'sourceCommit': 'b' * 40, 'bundleSha256': 'c' * 64, 'sourceHashes': {}, **request}
        system = root.System(request, daily)
        system.now = Mock(return_value=self.chain.at + dt.timedelta(minutes=2))
        return system

    def readers(self):
        return sorted(set(self.chain.active_access['allowedEmails']) | set(chained.TESTERS))

    def reader_selection(self, emails=None):
        return {'purpose': 'reader-admission', 'previousTermsSha256': root.canonical_sha(self.chain.terms),
                'readers': {'allowedEmails': self.readers() if emails is None else emails}}

    def beta_selection(self, participants=None, project='10', user='3.33'):
        at = self.chain.at
        iso = chained.iso
        return {'purpose': 'tester-beta', 'previousTermsSha256': root.canonical_sha(self.chain.terms),
                'closePreviousAt': iso(at + dt.timedelta(minutes=5)),
                'next': {'participants': participants or self.chain.testers(), 'projectUsd': project, 'userUsd': user,
                         'startsAt': iso(at + dt.timedelta(minutes=10)),
                         'endsAt': iso(at + dt.timedelta(days=30, minutes=10))}}


class GenerationSelectionTests(ChainRootBase):
    def test_prepare_targets_the_next_free_generation_and_other_modes_the_last_one(self):
        self.assertEqual((self.system().root, self.system().generation), (self.chain.root(2), 2))
        self.assertEqual((self.system('apply').root, self.system('apply').generation), (self.chain.fixture.root, 1))
        self.chain.admit_readers()
        self.assertEqual(self.system().generation, 3)
        self.assertEqual(self.system('recover').generation, 2)
        self.assertEqual(self.system('archive-expired').root, self.chain.root(2))

    def test_generation_limit_and_gaps_are_refused(self):
        self.chain.admit_readers()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, value, window_changed=True)
        self.fixture.write(self.chain.root(4) / 'prepared.json', b'{}')
        with self.assertRaisesRegex(ValueError, 'limit'):
            self.system()
        for path in self.chain.root(4).iterdir():
            path.unlink()
        self.chain.root(4).rmdir()
        self.fixture.write(self.chain.root(4) / 'prepared.json', b'{}')
        self.chain.root(3).joinpath('prepared.json').rename(self.chain.root(3).parent / 'moved.json')
        for path in self.chain.root(3).rglob('*'):
            if path.is_file():
                path.unlink()
        for path in sorted(self.chain.root(3).rglob('*'), reverse=True):
            path.rmdir()
        self.chain.root(3).rmdir()
        with self.assertRaisesRegex(ValueError, 'contiguous'):
            self.system('apply')

    def test_an_installed_daily_without_chained_authority_is_refused(self):
        old = type('Old', (), {})()
        with self.assertRaisesRegex(ValueError, 'chained successor authority'):
            root.System({'mode': 'prepare', 'sourceCommit': 'b' * 40, 'bundleSha256': 'c' * 64, 'sourceHashes': {}}, old)

    def test_purposes_are_bound_to_the_generation(self):
        owner = {'purpose': 'owner-e2e', 'previousTermsSha256': 'a' * 64, 'closePreviousAt': 'x', 'next': {}}
        second = self.system(selection=owner)
        with self.assertRaisesRegex(ValueError, 'purpose for this generation'):
            second.selected()
        first = self.system('apply', selection=self.reader_selection())
        with self.assertRaisesRegex(ValueError, 'purpose for this generation'):
            first.selected()
        self.assertEqual(self.system(selection=self.reader_selection()).selected()['purpose'], 'reader-admission')
        self.assertEqual(self.system(selection=self.beta_selection()).selected()['purpose'], 'tester-beta')


class SelectionValueTests(ChainRootBase):
    def test_reader_admission_sets_no_allowance_and_only_a_sorted_new_list(self):
        self.assertEqual(root.selection_values(self.reader_selection()), {})
        bad = [
            ('unsorted', [chained.TESTERS[1], chained.TESTERS[0]]),
            ('duplicate', [chained.TESTERS[0], chained.TESTERS[0]]),
            ('uppercase', ['Tester@Example.invalid']),
            ('empty', []),
            ('eleven', ['u%02d@example.invalid' % n for n in range(11)]),
        ]
        for label, emails in bad:
            with self.subTest(label), self.assertRaises(ValueError):
                root.selection_values(self.reader_selection(emails))
        extra = {**self.reader_selection(), 'next': {}}
        with self.assertRaises(ValueError):
            root.selection_values(extra)

    def test_tester_beta_is_exactly_three_unique_participants_ten_and_three_thirty_three(self):
        values = root.selection_values(self.beta_selection())
        self.assertEqual((values['AI_PROJECT_BUDGET_USD'], values['AI_USER_BUDGET_USD']), ('10', '3.33'))
        self.assertEqual(values['CLOSED_BETA_USER_IDS'], ','.join(p['userId'] for p in self.chain.testers()))
        users = self.chain.testers()
        for label, selection in [
            ('two', self.beta_selection(users[:2])),
            ('four', self.beta_selection(users + [{'email': 'x@example.invalid', 'userId': '44444444-4444-4444-8444-444444444444'}])),
            ('project cap', self.beta_selection(project='11')),
            ('user cap', self.beta_selection(user='3.34')),
            ('owner window', self.beta_selection(project='3', user='3')),
            ('duplicate user', self.beta_selection([users[0], users[1], {**users[2], 'userId': users[1]['userId']}])),
            ('duplicate email', self.beta_selection([users[0], users[1], {**users[2], 'email': users[1]['email']}])),
            ('bad uuid', self.beta_selection([users[0], users[1], {**users[2], 'userId': 'not-a-uuid'}])),
            ('extra key', self.beta_selection([users[0], users[1], {**users[2], 'role': 'admin'}])),
        ]:
            with self.subTest(label), self.assertRaises(ValueError):
                root.selection_values(selection)

    def test_cohort_is_the_selection_for_windows_and_the_authenticated_previous_terms_for_readers(self):
        tester = root.runtime_selection(self.beta_selection())
        self.assertEqual(tester['cohortUserIds'], [p['userId'] for p in self.chain.testers()])
        reader = root.runtime_selection(self.reader_selection(), self.chain.terms)
        self.assertEqual(reader['cohortUserIds'], [p['userId'] for p in self.chain.terms['participants']])
        with self.assertRaises(ValueError):
            root.runtime_selection(self.reader_selection())


class EnvironmentTests(ChainRootBase):
    def text(self):
        terms = self.chain.terms
        values = {'CLOSED_BETA_USER_IDS': ','.join(p['userId'] for p in terms['participants']),
                  'AI_PROJECT_BUDGET_USD': terms['projectUsd'], 'AI_USER_BUDGET_USD': terms['userUsd'],
                  'AI_BUDGET_WINDOW_START': terms['startsAt'], 'AI_BUDGET_WINDOW_END': terms['endsAt'],
                  'ALTERWARD_TAG': 'contabo-000000000000', 'OPENAI_API_KEY': 'synthetic-preserved',
                  'CLOSED_SITE_ALLOWED_EMAILS': ','.join(self.chain.active_access['allowedEmails']),
                  'NARRATIVE_PIPELINE_MODE': 'narrative-fiction-v2', 'NARRATIVE_FICTION_GENERATION': 'v9',
                  'NARRATIVE_COHORT_USER_IDS': ','.join(p['userId'] for p in terms['participants']),
                  'AI_FICTION_TIMEOUT_MS': '300000', 'AI_FICTION_MAX_REQUEST_BYTES': '196608',
                  'SYNTHETIC_UNRELATED': 'unchanged'}
        return ''.join(k + "='" + v + "'\n" for k, v in values.items())

    def test_reader_admission_changes_only_the_reader_line_and_the_image_tag(self):
        selection = self.reader_selection()
        before = funded.upgrade.server_environment(self.text())
        after = funded.upgrade.server_environment(root.candidate_environment(
            self.text(), selection, 'alterward:contabo-aaaaaaaaaaaa', self.chain.terms).decode())
        changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
        self.assertEqual(changed, {'CLOSED_SITE_ALLOWED_EMAILS', 'ALTERWARD_TAG'})
        self.assertEqual(after['CLOSED_SITE_ALLOWED_EMAILS'], ','.join(selection['readers']['allowedEmails']))

    def test_tester_beta_changes_only_allowance_cohort_and_image_tag(self):
        selection = self.beta_selection()
        before = funded.upgrade.server_environment(self.text())
        after = funded.upgrade.server_environment(root.candidate_environment(
            self.text(), selection, 'alterward:contabo-aaaaaaaaaaaa', self.chain.terms).decode())
        changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
        self.assertEqual(changed, {'CLOSED_BETA_USER_IDS', 'AI_PROJECT_BUDGET_USD', 'AI_USER_BUDGET_USD',
                                   'AI_BUDGET_WINDOW_START', 'AI_BUDGET_WINDOW_END', 'ALTERWARD_TAG',
                                   'NARRATIVE_COHORT_USER_IDS'})
        self.assertEqual(after['OPENAI_API_KEY'], 'synthetic-preserved')
        self.assertEqual(after['AI_PROJECT_BUDGET_USD'], '10')
        self.assertEqual(after['CLOSED_SITE_ALLOWED_EMAILS'], before['CLOSED_SITE_ALLOWED_EMAILS'])

    def test_a_missing_reader_line_or_unrelated_change_is_refused(self):
        text = ''.join(line for line in self.text().splitlines(True) if not line.startswith('CLOSED_SITE_ALLOWED_EMAILS'))
        with self.assertRaises(ValueError):
            root.candidate_environment(text, self.reader_selection(), 'alterward:contabo-aaaaaaaaaaaa', self.chain.terms)

    def test_rendered_configuration_must_differ_only_by_the_approved_delta(self):
        config = {'services': {
            'web': {'image': 'x', 'environment': {'CLOSED_SITE_ALLOWED_EMAILS': 'a@example.invalid'}},
            'api': {'image': 'x', 'environment': {'CLOSED_SITE_ALLOWED_EMAILS': 'a@example.invalid',
                                                  'AI_PROJECT_BUDGET_USD': '3', 'AI_USER_BUDGET_USD': '3',
                                                  'CLOSED_BETA_USER_IDS': 'u'}},
            'worker': {'image': 'x', 'environment': {'AI_PROJECT_BUDGET_USD': '3', 'AI_USER_BUDGET_USD': '3',
                                                     'CLOSED_BETA_USER_IDS': 'u', 'AI_BUDGET_WINDOW_START': 's',
                                                     'AI_BUDGET_WINDOW_END': 'e'}}}}
        new = copy.deepcopy(config)
        selection = self.reader_selection()
        emails = ','.join(selection['readers']['allowedEmails'])
        for service in ('web', 'api'):
            new['services'][service]['environment']['CLOSED_SITE_ALLOWED_EMAILS'] = emails
        self.assertEqual(root.normalized(new, selection, self.chain.terms), root.normalized(config, selection, self.chain.terms))
        new['services']['api']['environment']['AI_USER_BUDGET_USD'] = '4'
        self.assertNotEqual(root.normalized(new, selection, self.chain.terms), root.normalized(config, selection, self.chain.terms))


class AccessTests(ChainRootBase):
    def snapshot(self, emails, **override):
        value = {'checkedAt': (self.chain.at + dt.timedelta(minutes=2)).isoformat(), 'teamDomain': self.chain.active_access['teamDomain'],
                 'audience': self.chain.active_access['audience'], 'allowedEmails': emails, 'configurationSha256': 'd' * 64}
        return {**value, **override}

    def config(self, emails):
        def env(readers=True):
            value = {'CLOUDFLARE_ACCESS_TEAM_DOMAIN': self.chain.active_access['teamDomain'],
                     'CLOUDFLARE_ACCESS_AUD': self.chain.active_access['audience']}
            if readers:
                value['CLOSED_SITE_ALLOWED_EMAILS'] = ','.join(emails)
            return {'environment': value}
        return {'services': {'web': env(), 'api': env()}}

    def check(self, system, snapshot, origin):
        system.request['accessSnapshot'] = snapshot
        system.configuration = Mock(return_value=self.config(origin))
        return system.access()

    def test_reader_admission_requires_external_access_to_lead_the_origin(self):
        selection = self.reader_selection()
        system = self.system(selection=selection)
        old, new = self.chain.active_access['allowedEmails'], selection['readers']['allowedEmails']
        self.assertEqual(self.check(system, self.snapshot(new), old), 'd' * 64)
        self.assertEqual(self.check(system, self.snapshot(new), new), 'd' * 64)
        for label, snapshot, origin in [
            ('access not yet extended', self.snapshot(old), old),
            ('access extended differently', self.snapshot(new + ['stranger@example.invalid']), old),
            ('origin ahead of selection', self.snapshot(new), new + ['stranger@example.invalid']),
            ('origin below the previous list', self.snapshot(new), old[:1]),
            ('foreign audience', self.snapshot(new, audience='f' * 64), old),
            ('stale observation', self.snapshot(new, checkedAt=(self.chain.at - dt.timedelta(hours=1)).isoformat()), old),
        ]:
            with self.subTest(label), self.assertRaises(ValueError):
                self.check(system, snapshot, origin)

    def test_a_tester_window_requires_the_admitted_list_on_both_sides(self):
        self.chain.admit_readers()
        system = self.system(selection=self.beta_selection())
        current = self.chain.active_access['allowedEmails']
        self.assertEqual(self.check(system, self.snapshot(current), current), 'd' * 64)
        previous = sorted(set(current) - set(chained.TESTERS))
        with self.assertRaises(ValueError):
            self.check(system, self.snapshot(current), previous)
        with self.assertRaises(ValueError):
            self.check(system, self.snapshot(previous), current)


class ReaderAccountingTests(ChainRootBase):
    def prepared(self):
        selection = self.reader_selection()
        value = self.chain.prepare(2, 'reader-admission', emails=selection['readers']['allowedEmails'])
        return selection, value

    def test_reader_operation_and_receipt_match_what_daily_accepts(self):
        selection, value = self.prepared()
        system = self.system('apply', selection=selection)
        system.now = Mock(return_value=funded.stamp(value['preparedAt']))
        self.assertEqual(system.reader_operation(), value['operation'])
        self.assertEqual(system.reader_receipt(), (self.chain.root(2) / 'access.json').read_bytes())
        with self.assertRaises(ValueError):
            system.accounting('image', 'capture')

    def test_candidate_is_bound_to_exact_source_selection_and_parent_generation(self):
        selection, value = self.prepared()
        request = {'selection': selection, 'release': value['release'], 'preparedSha256': daily.digest(authority.encoded(value))}
        system = self.system('apply', **request)
        self.assertEqual(system.candidate(), value)
        self.assertEqual(system.generation, 2)
        request['selection'] = {**selection, 'readers': {'allowedEmails': selection['readers']['allowedEmails'] + ['z@example.invalid']}}
        with self.assertRaises(ValueError):
            self.system('apply', **request).candidate()

    def test_parent_is_the_previous_fully_exposed_generation(self):
        selection, value = self.prepared()
        system = self.system('apply', selection=selection)
        parent, role, hashes = system.parent()
        self.assertEqual(role, 'target')
        self.assertEqual(daily.digest(authority.encoded(parent)), hashes['parentPreparedSha256'])
        self.assertEqual(parent['files'][role], self.chain.active_role_files)
        (self.fixture.root / 'readback.json').write_bytes(b'{}')
        with self.assertRaises(ValueError):
            system.parent()

    def test_reader_admission_never_applies_or_replays_database_changes(self):
        selection, value = self.prepared()
        database = {'version': 'alterward-funded-runtime-1', 'schema': 39, 'identityBindingSha256': 'a' * 64,
                    'dataSha256': 'b' * 64, 'artifactSha256': 'c' * 64, 'catalogSha256': 'd' * 64,
                    'policiesSha256': 'e' * 64, 'drained': True, 'providerApiCalls': 0}
        value = {**value, 'database': database}
        self.fixture.write(self.chain.root(2) / 'prepared.json', authority.encoded(value))
        system = self.system('apply', selection=selection)
        system.probe = Mock(return_value=database)
        self.assertEqual(system.apply_accounts(value), {'accountsChanged': False})
        before = system.reconcile_accounts(value)
        self.assertEqual((before['state'], before['protectedDataUnchanged'], before['paidAiCalls']), ('uncommitted', True, 0))
        self.chain.journal(2, ['apply-intent', 'held', 'database-intent'])
        self.assertEqual(system.reconcile_accounts(value)['state'], 'committed')
        self.assertEqual(before['operationSha256'], root.canonical_sha(value['operation']))
        system.probe.return_value = {**database, 'dataSha256': 'f' * 64}
        with self.assertRaises(ValueError):
            system.reconcile_accounts(value)

    def test_reader_admission_neither_closes_an_allowance_nor_checks_a_window_start(self):
        selection, value = self.prepared()
        system = self.system('apply', selection=selection)
        system.require_future_start(value)
        system.now.return_value = funded.stamp(self.chain.terms['endsAt']) + dt.timedelta(days=1)
        system.require_future_start(value)


class TesterBeta(ChainRootBase):
    def test_tester_beta_candidate_chains_to_the_exposed_reader_generation(self):
        self.chain.admit_readers()
        selection = self.beta_selection()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        request = {'selection': json.loads((self.chain.root(3) / 'selection.json').read_bytes()), 'release': value['release'],
                   'preparedSha256': daily.digest(authority.encoded(value))}
        system = self.system('apply', **request)
        self.assertEqual((system.generation, system.candidate()), (3, value))
        self.assertEqual(system.original_terms(), self.chain.terms)
        self.assertEqual(system.active_access(), self.chain.active_access)
        self.assertEqual(selection['purpose'], 'tester-beta')

    def test_a_second_tester_window_is_recognized_from_the_effective_terms(self):
        self.assertFalse(root.is_tester_window(self.chain.terms))
        self.chain.admit_readers()
        value = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, value, window_changed=True)
        # A later generation's effective terms ARE the tester window, so another
        # tester-beta selection (or one behind a reader step) is refused in prepare.
        self.assertTrue(root.is_tester_window(self.chain.terms))
        self.assertTrue(root.is_tester_window(self.system().original_terms()))

    def test_tester_beta_uses_the_database_accounting_transport_with_previous_terms(self):
        self.chain.admit_readers()
        selection = self.beta_selection()
        system = self.system(selection=selection)
        system.raw_probe = Mock(return_value={'observed': True})
        self.assertEqual(system.accounting('image', 'reconcile', {'plan': {}}), {'observed': True})
        data = system.raw_probe.call_args.args[1]
        self.assertEqual(data['mode'], 'successor')
        self.assertEqual(data['expected']['previous'], self.chain.terms)
        self.assertEqual(data['expected']['selection'], selection)

    def test_database_capture_authenticates_previous_and_new_participants_once(self):
        self.chain.admit_readers()
        system = self.system(selection=self.beta_selection())
        system.raw_probe = Mock(return_value={'version': 'alterward-funded-runtime-1', 'schema': 39,
                                              'identityBindingSha256': 'a' * 64, 'dataSha256': 'b' * 64,
                                              'artifactSha256': 'c' * 64, 'catalogSha256': 'd' * 64,
                                              'policiesSha256': 'e' * 64, 'drained': True, 'providerApiCalls': 0})
        system.probe('image', 'capture')
        sent = system.raw_probe.call_args.args[1]['participants']
        self.assertEqual(sorted(p['userId'] for p in sent), sorted(p['userId'] for p in self.chain.testers()))



class SchemaBase(ChainRootBase):
    DATABASE = {'version': 'alterward-funded-runtime-1', 'schema': 38, 'identityBindingSha256': 'a' * 64,
                'dataSha256': 'b' * 64, 'artifactSha256': 'c' * 64, 'catalogSha256': 'd' * 64,
                'policiesSha256': 'e' * 64, 'drained': True, 'providerApiCalls': 0}

    def selection(self, **changes):
        return {'purpose': 'schema-039', 'previousTermsSha256': root.canonical_sha(self.chain.terms),
                'fromSchema': 38, 'toSchema': 39, **changes}

    def tip(self):
        self.chain.admit_readers()
        tester = self.chain.prepare(3, 'tester-beta', participants=self.chain.testers())
        self.chain.expose(3, tester, window_changed=True)

    def prepared_system(self, mode='apply', **request):
        self.tip()
        value = {**self.chain.prepare(4, 'schema-039'), 'database': self.DATABASE}
        self.fixture.write(self.chain.root(4) / 'prepared.json', authority.encoded(value))
        selection = self.selection()
        system = self.system(mode, selection=selection, release=value['release'],
                             preparedSha256=daily.digest(authority.encoded(value)), **request)
        system.now = Mock(return_value=funded.stamp(value['preparedAt']))
        return system, value

    def observed(self, **changes):
        return {**self.DATABASE, **changes}


class SchemaUpgrade(SchemaBase):
    def test_schema_upgrade_is_selectable_behind_the_first_generation_only(self):
        self.tip()
        self.assertEqual(self.system(selection=self.selection()).selected()['purpose'], 'schema-039')
        self.assertEqual(self.system(selection=self.selection()).generation, 4)

    def test_schema_upgrade_is_not_a_first_generation_purpose(self):
        self.assertEqual(self.system('apply').generation, 1)
        with self.assertRaisesRegex(ValueError, 'purpose for this generation'):
            self.system('apply', selection=self.selection()).selected()

    def test_selection_is_exactly_038_to_039_with_the_active_terms(self):
        self.assertEqual(root.selection_values(self.selection()), {})
        for label, selection in [
            ('target 040', self.selection(toSchema=40)), ('source 037', self.selection(fromSchema=37)),
            ('same schema', self.selection(fromSchema=39)), ('string schema', self.selection(toSchema='39')),
            ('bool schema', self.selection(toSchema=True)), ('no digest', self.selection(previousTermsSha256='x')),
            ('extra window', {**self.selection(), 'next': {}}), ('extra readers', {**self.selection(), 'readers': {}}),
            ('missing source', {k: v for k, v in self.selection().items() if k != 'fromSchema'}),
        ]:
            with self.subTest(label), self.assertRaises(ValueError):
                root.selection_values(selection)

    def test_cohort_is_the_authenticated_active_window_and_cannot_change(self):
        runtime = root.runtime_selection(self.selection(), self.chain.terms)
        self.assertEqual(runtime['cohortUserIds'], [p['userId'] for p in self.chain.terms['participants']])
        with self.assertRaises(ValueError):
            root.runtime_selection(self.selection())

    def test_environment_changes_only_the_image_tag(self):
        text = EnvironmentTests.text(self)
        before = funded.upgrade.server_environment(text)
        after = funded.upgrade.server_environment(root.candidate_environment(
            text, self.selection(), 'alterward:contabo-aaaaaaaaaaaa', self.chain.terms).decode())
        self.assertEqual({k for k in set(before) | set(after) if before.get(k) != after.get(k)}, {'ALTERWARD_TAG'})

    def rendered(self, billing=True):
        env = {'AI_PROJECT_BUDGET_USD': '10', 'CLOSED_BETA_USER_IDS': 'u'}
        def service(extra=None):
            return {'image': 'x', 'environment': {**env, **(extra or {})}}
        return {'services': {'web': {'image': 'x', 'environment': {}},
                             'api': service(funded.BILLING_DEFAULTS if billing else None),
                             'worker': service(funded.BILLING_DEFAULTS if billing else None)}}

    def test_a_newer_compose_may_add_only_the_default_off_billing_values(self):
        selection = self.selection()
        previous = self.chain.terms
        old = self.rendered(billing=False)
        self.assertEqual(root.normalized(self.rendered(), selection, previous), root.normalized(old, selection, previous))
        # The originals of an earlier release (no billing keys) and one that already
        # carries the very same defaults are the same runtime.
        self.assertEqual(root.normalized(old, selection, previous), root.normalized(self.rendered(), selection, previous))
        # Any nondefault value, on either side, is an unreviewed change.
        for service, key, bad in [('api', 'BILLING_ENABLED', 'true'), ('worker', 'BILLING_ENABLED', 'true'),
                                  ('api', 'BILLING_ENFORCEMENT', 'true'), ('worker', 'STRIPE_SECRET_KEY', 'sk_test_x'),
                                  ('api', 'STRIPE_WEBHOOK_SECRET', 'whsec_x'), ('api', 'STRIPE_PRICE_ID', 'price_x'),
                                  ('worker', 'BILLING_FOUNDER_USER_IDS', 'u'), ('api', 'BILLING_SUCCESS_URL', 'https://x'),
                                  ('worker', 'BILLING_RESERVATION_TTL_SECONDS', '1')]:
            with self.subTest(service=service, key=key):
                drift = self.rendered()
                drift['services'][service]['environment'][key] = bad
                self.assertNotEqual(root.normalized(drift, selection, previous), root.normalized(old, selection, previous))
                self.assertNotEqual(root.normalized(old, selection, previous), root.normalized(drift, selection, previous))
        web = self.rendered()
        web['services']['web']['environment']['BILLING_ENABLED'] = 'false'
        self.assertNotEqual(root.normalized(web, selection, previous), root.normalized(old, selection, previous))
        other = self.rendered()
        other['services']['api']['environment']['SOMETHING_ELSE'] = 'x'
        self.assertNotEqual(root.normalized(other, selection, previous), root.normalized(old, selection, previous))

    def test_probe_captures_038_or_039_and_migrates_only_with_the_captured_state(self):
        self.tip()
        system = self.system(selection=self.selection())
        system.raw_probe = Mock(return_value=self.observed())
        self.assertEqual(system.probe('image', 'capture')['schema'], 38)
        sent = system.raw_probe.call_args.args[1]
        self.assertEqual((sent['mode'], sent['expected']), ('capture', None))
        self.assertEqual(sorted(p['userId'] for p in sent['participants']),
                         sorted(p['userId'] for p in self.chain.terms['participants']))
        system.raw_probe.return_value = self.observed(schema=39)
        self.assertEqual(system.probe('image', 'migrate', self.observed())['schema'], 39)
        self.assertEqual(system.raw_probe.call_args.args[1]['mode'], 'migrate')
        for label, mode, expected, value in [
            ('migrate without state', 'migrate', None, self.observed(schema=39)),
            ('capture with state', 'capture', self.observed(), self.observed()),
            ('unknown mode', 'successor', None, self.observed()),
            ('migrate stays 038', 'migrate', self.observed(), self.observed()),
            ('schema 037', 'capture', None, self.observed(schema=37)),
            ('schema 040', 'capture', None, self.observed(schema=40)),
            ('not drained', 'capture', None, self.observed(drained=False)),
            ('provider call', 'capture', None, self.observed(providerApiCalls=1)),
            ('extra field', 'capture', None, {**self.observed(), 'x': 1}),
        ]:
            with self.subTest(label):
                system.raw_probe.return_value = value
                with self.assertRaises(ValueError):
                    system.probe('image', mode, expected)

    def test_there_is_no_accounting_operation_and_no_window_start_check(self):
        system, value = self.prepared_system()
        with self.assertRaises(ValueError):
            system.accounting('image', 'capture')
        system.require_future_start(value)
        system.now.return_value = funded.stamp(self.chain.terms['endsAt']) + dt.timedelta(days=1)
        system.require_future_start(value)

    def test_operation_and_candidate_match_what_daily_accepts(self):
        system, value = self.prepared_system()
        self.assertEqual(system.schema_operation(), value['operation'])
        self.assertEqual(system.candidate(), value)
        self.assertEqual((system.generation, system.is_schema(), system.is_window(), system.is_reader()), (4, True, False, False))

    def test_reconcile_reads_the_database_state_and_protects_the_data(self):
        system, value = self.prepared_system()
        system.probe = Mock(return_value=self.observed())
        before = system.reconcile_accounts(value)
        self.assertEqual((before['state'], before['protectedDataUnchanged'], before['paidAiCalls']), ('uncommitted', True, 0))
        self.assertEqual(before['operationSha256'], root.canonical_sha(value['operation']))
        system.probe.return_value = self.observed(schema=39, catalogSha256='f' * 64)
        self.assertEqual(system.reconcile_accounts(value)['state'], 'committed')
        for key in ('dataSha256', 'artifactSha256', 'policiesSha256', 'identityBindingSha256'):
            with self.subTest(key):
                system.probe.return_value = self.observed(schema=39, **{key: '0' * 64})
                with self.assertRaises(ValueError):
                    system.reconcile_accounts(value)

    def test_migration_runs_once_from_a_captured_038_and_proves_the_result(self):
        system, value = self.prepared_system()
        calls = []
        def probe(image, mode, expected=None):
            calls.append((mode, expected))
            return self.observed(schema=39, catalogSha256='f' * 64) if mode == 'migrate' else self.observed()
        system.probe = probe
        self.assertEqual(system.apply_accounts(value), {'migrated': True, 'schema': 39})
        self.assertEqual([c[0] for c in calls], ['capture', 'migrate'])
        self.assertEqual(calls[1][1], self.observed())
        for label, observed, migrated in [
            ('already 039', self.observed(schema=39), self.observed(schema=39)),
            ('data drift before', self.observed(dataSha256='0' * 64), self.observed(schema=39)),
            ('data drift by the migration', self.observed(), self.observed(schema=39, dataSha256='0' * 64)),
            ('artifact drift by the migration', self.observed(), self.observed(schema=39, artifactSha256='0' * 64)),
        ]:
            with self.subTest(label):
                system.probe = lambda image, mode, expected=None, a=observed, b=migrated: b if mode == 'migrate' else a
                with self.assertRaises(ValueError):
                    system.apply_accounts(value)

    def test_attempt_and_recovery_start_from_the_states_they_may_start_from(self):
        system, value = self.prepared_system()
        self.assertEqual(system.expected_states(), {'uncommitted'})
        self.assertEqual(system.expected_states(False), {'uncommitted'})
        self.assertEqual(system.expected_states(True), {'committed', 'uncommitted'})
        recovering = self.system('recover', selection=self.selection())
        self.assertEqual(recovering.expected_states(), {'committed', 'uncommitted'})
        recovering.probe = Mock(return_value=self.observed())
        self.assertTrue(recovering.database_pending(value))
        recovering.probe.return_value = self.observed(schema=39)
        self.assertFalse(recovering.database_pending(value))
        recovering.verify_drained(value)
        # Accounting generations keep the strict rule: committed only on recovery.
        self.chain.expose(4, value, window_changed=False, schema=True)

    def test_other_generations_never_replay_their_database_step(self):
        self.chain.admit_readers()
        selection = self.beta_selection()
        system = self.system('recover', selection=selection)
        self.assertEqual(system.expected_states(), {'committed'})
        self.assertFalse(system.database_pending({}))
        self.assertEqual(self.system(selection=selection).expected_states(), {'uncommitted'})

    def test_the_window_need_not_be_running_but_the_active_authority_is_still_required(self):
        self.tip()
        terms = self.chain.terms
        worker = {'CLOSED_BETA_USER_IDS': ','.join(p['userId'] for p in terms['participants']),
                  'AI_PROJECT_BUDGET_USD': terms['projectUsd'], 'AI_USER_BUDGET_USD': terms['userUsd'],
                  'AI_BUDGET_WINDOW_START': terms['startsAt'], 'AI_BUDGET_WINDOW_END': terms['endsAt']}
        parent = {'files': {'target': {}}, 'release': {'target': {'imageId': 'sha256:' + 'b' * 64}}}

        def baseline(selection, queue_allowed):
            system = self.system('prepare', selection=selection)
            system.parent = Mock(return_value=(parent, 'target', {}))
            system.hashes = Mock(return_value={})
            system.configuration = Mock(return_value={'services': {'worker': {'environment': worker}}})
            system.access = Mock(return_value='d' * 64)
            with patch.object(daily, 'owner_runtime'), \
                 patch.object(daily, 'personal_runtime_policy', return_value={'mode': 'personal-beta', 'queueAllowed': queue_allowed}), \
                 patch.object(funded.upgrade, 'inspect_owner'), patch.object(funded.upgrade, 'proxy_network', return_value='net'), \
                 patch.object(funded.upgrade, 'foreign_state', return_value=[]):
                return system.baseline()

        # An ended or not-yet-running window means nothing can generate: the upgrade
        # does not need it. The accounting generations and reader admission still do.
        self.assertEqual(baseline(self.selection(), False)['accessConfigurationSha256'], 'd' * 64)
        self.assertEqual(baseline(self.selection(), True)['accessConfigurationSha256'], 'd' * 64)
        with self.assertRaisesRegex(ValueError, 'Active parent funded window'):
            baseline(self.reader_selection(), False)
        # The funded configuration itself must still equal the authenticated terms.
        worker['AI_USER_BUDGET_USD'] = '99'
        with self.assertRaisesRegex(ValueError, 'Active parent funded window'):
            baseline(self.selection(), True)


class SchemaEngineFreeze(SchemaBase):
    """B1: the schema image may differ from the serving image ONLY in the reviewed allow-list."""
    ENGINE = 'packages/ai/src/narrative.ts'

    def hashes(self, **changes):
        allowed = {path: 'a' * 64 for path in funded.SCHEMA_039_ALLOWED_CHANGES}
        kept = {self.ENGINE: 'b' * 64, 'apps/worker/src/narrative-runner.ts': 'b' * 64,
                'database/migrations/038_x.sql': 'b' * 64, 'Dockerfile': 'b' * 64}
        return {**allowed, **kept, **changes}

    def schema_system(self, hashes):
        if not getattr(self, 'tipped', False):
            self.tip()
            self.tipped = True
        system = self.system(selection=self.selection(), sourceHashes=hashes)
        # prepare records selection.json before the freeze runs
        self.fixture.write(system.root / 'selection.json', authority.encoded(self.selection()))
        return system

    def test_allow_list_is_the_reviewed_32_billing_and_gate_files_and_never_the_engine(self):
        allowed = funded.SCHEMA_039_ALLOWED_CHANGES
        self.assertEqual(len(allowed), 32)
        self.assertEqual(list(allowed), sorted(set(allowed)))
        for path in allowed:
            self.assertTrue(path.startswith(('apps/', 'packages/', 'database/', 'deploy/')), path)
        # The narrative engine and its AI pipeline are not on it (claude.ts is a 4-line comment/price-date edit).
        engine_like = [p for p in allowed if p.startswith('packages/ai/') or 'narrative' in p or 'chapter' in p]
        self.assertEqual(engine_like, ['packages/ai/src/claude.ts'])

    def test_freeze_input_excludes_exactly_the_allow_list(self):
        system = self.schema_system(self.hashes())
        frozen = system.schema_frozen_source_hashes()
        self.assertEqual(set(frozen), {self.ENGINE, 'apps/worker/src/narrative-runner.ts',
                                       'database/migrations/038_x.sql', 'Dockerfile'})
        self.assertIn(root.sha(root.encoded(frozen)), system.capability_input_hashes())

    def test_the_serving_image_must_match_every_non_allowed_source(self):
        system = self.schema_system(self.hashes())
        with patch.object(system, 'capability', return_value=Mock(returncode=0)) as capability:
            system.require_engine_freeze('sha256:' + '5' * 64)
        image, sent = capability.call_args.args
        self.assertEqual(image, 'sha256:' + '5' * 64)
        self.assertEqual(sent, system.schema_frozen_source_hashes())
        self.assertFalse(set(sent) & set(funded.SCHEMA_039_ALLOWED_CHANGES))
        # The serving image disagreeing on ANY non-allowed path (checked inside that image) refuses.
        with patch.object(system, 'capability', return_value=Mock(returncode=1)):
            with self.assertRaisesRegex(ValueError, 'engine sources must remain unchanged'):
                system.require_engine_freeze('sha256:' + '5' * 64)

    def test_a_changed_engine_file_is_part_of_the_checked_input_and_a_changed_allowed_file_is_not(self):
        system = self.schema_system(self.hashes())
        frozen = lambda **changes: (system.request.update(sourceHashes=self.hashes(**changes)),
                                    system.schema_frozen_source_hashes())[1]
        base = frozen()
        engine = frozen(**{self.ENGINE: 'f' * 64})
        gate = frozen(**{funded.SCHEMA_039_ALLOWED_CHANGES[0]: 'f' * 64})
        self.assertNotEqual(engine, base)
        self.assertEqual(gate, base)

    def test_an_extra_unlisted_new_file_is_checked_and_therefore_refused_by_the_serving_image(self):
        hashes = self.hashes(**{'apps/api/src/surprise.ts': 'c' * 64})
        system = self.schema_system(hashes)
        self.assertIn('apps/api/src/surprise.ts', system.schema_frozen_source_hashes())

    def test_nothing_to_freeze_is_refused_and_other_purposes_keep_the_full_scope(self):
        system = self.schema_system({path: 'a' * 64 for path in funded.SCHEMA_039_ALLOWED_CHANGES})
        with self.assertRaisesRegex(ValueError, 'engine sources must remain unchanged'):
            system.require_engine_freeze('sha256:' + '5' * 64)

    def test_other_purposes_keep_the_full_scope_and_never_accept_the_filtered_one(self):
        self.chain.admit_readers()
        selection = self.beta_selection(participants=self.chain.testers())
        other = self.system(selection=selection, sourceHashes=self.hashes())
        self.fixture.write(other.root / 'selection.json', authority.encoded(selection))
        self.assertNotIn(root.sha(root.encoded(other.schema_frozen_source_hashes())), other.capability_input_hashes())
        self.assertIn(root.sha(root.encoded(other.frozen_source_hashes())), other.capability_input_hashes())

    def test_plan_carries_the_list_and_daily_demands_the_same_exact_list(self):
        self.assertEqual(list(funded.SCHEMA_039_ALLOWED_CHANGES), list(daily.SUCCESSOR_SCHEMA_ALLOWED_CHANGES))
        system, value = self.prepared_system()
        self.assertEqual(value['operation']['plan']['allowedChanges'], list(funded.SCHEMA_039_ALLOWED_CHANGES))
        self.assertEqual(system.schema_operation()['plan']['allowedChanges'], list(funded.SCHEMA_039_ALLOWED_CHANGES))

    def test_the_three_billing_default_sets_cannot_drift_apart(self):
        import re
        compose = (Path(__file__).resolve().parents[2] / 'deploy/compose.yaml').read_text()
        block = compose.split('x-billing: &billing', 1)[1].split('x-narrative', 1)[0]
        in_compose = dict(re.findall(r'^  ([A-Z_]+): \$\{[A-Z_]+:-(.*)\}$', block, re.M))
        self.assertEqual(in_compose, funded.BILLING_DEFAULTS)
        self.assertEqual(daily.SUCCESSOR_BILLING_DEFAULTS, funded.BILLING_DEFAULTS)


if __name__ == '__main__':
    unittest.main()
